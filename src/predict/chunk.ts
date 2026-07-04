/**
 * The unit of work one PLSpredict fold performs, shared by the sequential
 * `predictPls` and the Web Worker parallel variant. Pure module (no worker
 * globals); the message types double as the worker protocol and everything in
 * the request/response is plain data — safe to structured-clone.
 */

import { ols } from "../math/solve.ts";
import { estimatePls, type EstimatePlsOptions } from "../estimate/estimatePls.ts";
import type { Dataset } from "../estimate/data.ts";
import type { MeasurementModel } from "../specify/constructs.ts";
import type { SMRow } from "../specify/relationships.ts";
import type { MmMatrix } from "../model/mmMatrix.ts";
import { SmMatrix, type SmMatrixInput } from "../model/smMatrix.ts";
import { estimationInputs, type SerializedEstimationSpec } from "../workers/spec.ts";
import { predictOnData } from "./predict.ts";
import {
  predictDA,
  predictTechniqueFromName,
  type PredictTechnique,
  type PredictTechniqueName,
} from "./techniques.ts";

/** 0-based row assignment of one fold (rows index the full estimation data). */
export interface PredictFoldSpec {
  trainRows: number[];
  testRows: number[];
}

/** Everything a fold needs besides its row assignment. */
export interface PredictFoldContext {
  /** Full estimation data (cleaned, incl. interaction columns). */
  data: Dataset;
  measurementModel: MeasurementModel;
  structuralModel: SmMatrixInput;
  options: EstimatePlsOptions;
  technique: PredictTechnique;
  /** Non-interaction measured variables of the full model. */
  noIntVars: string[];
  /** Endogenous constructs of the full model, in structural order. */
  endogenous: string[];
}

export interface PredictFoldResult {
  /** Predicted construct scores / items for the fold's test rows. */
  testScores: number[][];
  testItems: number[][];
  /** Predicted construct scores / items for the fold's train rows. */
  trainScores: number[][];
  trainItems: number[][];
  /** LM benchmark predictions (cols = endogenous items, concatenated per dv). */
  lmTest: number[][];
  lmTrain: number[][];
}

function selectRows(data: Dataset, rows: readonly number[]): Dataset {
  return { columns: data.columns, values: rows.map((r) => [...data.values[r]!]) };
}

interface LmPredictions {
  /** Predicted values per dependent item for the train rows, keyed by item. */
  inSample: number[][];
  /** Predicted values per dependent item for the test rows. */
  outSample: number[][];
  items: string[];
}

/** LM benchmark for one endogenous construct (feature_plspredict.R:813-867). */
function lmPredictions(
  mmMatrix: MmMatrix,
  smMatrix: SmMatrix,
  dataMm: Dataset,
  dv: string,
  trainRows: readonly number[],
  testRows: readonly number[],
  technique: PredictTechnique,
): LmPredictions {
  const depItems = mmMatrix.constructItems(dv);
  const indepConstructs =
    technique === predictDA ? smMatrix.constructAntecedents(dv) : smMatrix.onlyExogenous();
  const indepItems = indepConstructs.flatMap((c) => mmMatrix.constructItems(c));
  const indepIdx = indepItems.map((item) => dataMm.columns.indexOf(item));
  const designRow = (r: number): number[] => [1, ...indepIdx.map((j) => dataMm.values[r]![j]!)];
  const xTrain = trainRows.map(designRow);
  const xTest = testRows.map(designRow);

  const inSample = trainRows.map(() => new Array<number>(depItems.length));
  const outSample = testRows.map(() => new Array<number>(depItems.length));
  depItems.forEach((item, d) => {
    const j = dataMm.columns.indexOf(item);
    const y = trainRows.map((r) => dataMm.values[r]![j]!);
    const beta = ols(xTrain, y);
    const predict = (row: readonly number[]): number =>
      row.reduce((s, v, k) => s + v * beta[k]!, 0);
    xTrain.forEach((row, r) => {
      inSample[r]![d] = predict(row);
    });
    xTest.forEach((row, r) => {
      outSample[r]![d] = predict(row);
    });
  });
  return { inSample, outSample, items: depItems };
}

/** Re-estimate on the fold's train rows and predict both partitions + LM benchmark. */
export function runPredictFold(
  context: PredictFoldContext,
  fold: PredictFoldSpec,
): PredictFoldResult {
  const trainingData = selectRows(context.data, fold.trainRows);
  const testingData = selectRows(context.data, fold.testRows);
  const trainModel = estimatePls(
    trainingData,
    context.measurementModel,
    context.structuralModel,
    context.options,
  );

  const testPred = predictOnData(trainModel, testingData, context.technique, context.noIntVars);
  const trainPred = predictOnData(trainModel, trainingData, context.technique, context.noIntVars);

  const smMatrix = SmMatrix.from(context.structuralModel);
  const lmTest = fold.testRows.map(() => [] as number[]);
  const lmTrain = fold.trainRows.map(() => [] as number[]);
  for (const dv of context.endogenous) {
    const lm = lmPredictions(
      trainModel.mmMatrix,
      smMatrix,
      context.data,
      dv,
      fold.trainRows,
      fold.testRows,
      context.technique,
    );
    lm.outSample.forEach((row, r) => lmTest[r]!.push(...row));
    lm.inSample.forEach((row, r) => lmTrain[r]!.push(...row));
  }

  return {
    testScores: testPred.scores,
    testItems: testPred.items,
    trainScores: trainPred.scores,
    trainItems: trainPred.items,
    lmTest,
    lmTrain,
  };
}

export interface PredictWorkerRequest extends SerializedEstimationSpec {
  /** Discriminator for the shared dispatching worker. */
  kind: "predict";
  data: Dataset;
  structuralModel: readonly Readonly<SMRow>[];
  technique: PredictTechniqueName;
  noIntVars: string[];
  endogenous: string[];
  /** The folds this chunk is responsible for. */
  folds: PredictFoldSpec[];
}

export interface PredictWorkerResponse {
  /** One entry per requested fold, in order. */
  folds: PredictFoldResult[];
}

/** Run every fold of one chunk (used by the worker; testable inline). */
export function runPredictFoldChunk(request: PredictWorkerRequest): PredictWorkerResponse {
  const { measurementModel, options } = estimationInputs(request);
  const context: PredictFoldContext = {
    data: request.data,
    measurementModel,
    structuralModel: request.structuralModel,
    options,
    technique: predictTechniqueFromName(request.technique),
    noIntVars: request.noIntVars,
    endogenous: request.endogenous,
  };
  return { folds: request.folds.map((fold) => runPredictFold(context, fold)) };
}
