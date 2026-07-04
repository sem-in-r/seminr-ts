/**
 * PLSpredict: k-fold / LOOCV cross-validated predictions for a PLS model,
 * as seminr's `predict_pls` (feature_plspredict.R:481-545) with the per-fold
 * machinery of `in_and_out_sample_predictions` (:600-673), the interaction
 * predict paths (:119-286), and the LM benchmark (:813-867). The per-fold
 * work lives in ./chunk.ts, shared with the Web Worker parallel variant.
 */

import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import type { PlsModel } from "../estimate/estimatePls.ts";
import { selectColumns } from "../estimate/data.ts";
import { isInteraction } from "../model/smMatrix.ts";
import { mulberry32 } from "../bootstrap/rng.ts";
import {
  runPredictFold,
  type PredictFoldContext,
  type PredictFoldResult,
  type PredictFoldSpec,
} from "./chunk.ts";
import { predictDA, type PredictTechnique } from "./techniques.ts";

export interface PredictPlsOptions {
  technique?: PredictTechnique;
  /** Number of folds; omit for leave-one-out cross-validation. */
  noFolds?: number;
  /**
   * 0-based row permutation defining the shuffled order folds are cut from
   * (defaults to a seeded random shuffle). Inject for exact R parity.
   */
  ordering?: readonly number[];
  /** Seed for the default shuffle. */
  seed?: number;
}

export interface PlsPredictionComposites {
  compositeOutOfSample: NamedMatrix;
  compositeInSample: NamedMatrix;
  /** Reference construct scores of the full model. */
  actualsStar: NamedMatrix;
}

export interface PlsPredictionItems {
  plsOutOfSample: NamedMatrix;
  plsInSample: NamedMatrix;
  lmOutOfSample: NamedMatrix;
  lmInSample: NamedMatrix;
  itemActuals: NamedMatrix;
  plsOutOfSampleResiduals: NamedMatrix;
  plsInSampleResiduals: NamedMatrix;
  lmOutOfSampleResiduals: NamedMatrix;
  lmInSampleResiduals: NamedMatrix;
}

export interface PlsPrediction {
  readonly kind: "predict_pls";
  readonly composites: PlsPredictionComposites;
  readonly items: PlsPredictionItems;
  readonly model: PlsModel;
}

/** Fold id (1-based) per position, replicating R's `cut(seq_len(n), breaks = k)`. */
export function cutFolds(n: number, k: number): number[] {
  const fuzz = (n - 1) / 1000;
  const breaks = Array.from({ length: k + 1 }, (_, j) => 1 + (j * (n - 1)) / k);
  breaks[0] = 1 - fuzz;
  breaks[k] = n + fuzz;
  return Array.from({ length: n }, (_, i) => {
    let fold = 1;
    while (i + 1 > breaks[fold]!) fold++;
    return fold;
  });
}

/** Resolved cross-validation plan shared by the sequential and parallel variants. */
export interface PredictPlan {
  technique: PredictTechnique;
  noFolds: number;
  foldSpecs: PredictFoldSpec[];
  noIntVars: string[];
  endogenous: string[];
}

/** Validate options and assign every data row to a fold. */
export function resolvePredictPlan(model: PlsModel, options: PredictPlsOptions): PredictPlan {
  if (model.hoc) {
    throw new Error("There is no published solution for applying PLSpredict to higher-order models");
  }
  const technique = options.technique ?? predictDA;
  const n = model.data.values.length;
  const noFolds = options.noFolds ?? n; // LOOCV by default, as seminr
  if (noFolds < 2 || noFolds > n) {
    throw new Error(`noFolds must be between 2 and ${n} (got ${noFolds})`);
  }
  const ordering = options.ordering ?? defaultShuffle(n, options.seed);
  if (ordering.length !== n) throw new Error("ordering must be a permutation of all data rows");
  const folds = cutFolds(n, noFolds);

  const foldSpecs = Array.from({ length: noFolds }, (_, k) => {
    const spec: PredictFoldSpec = { trainRows: [], testRows: [] };
    folds.forEach((f, pos) => (f === k + 1 ? spec.testRows : spec.trainRows).push(ordering[pos]!));
    return spec;
  });

  return {
    technique,
    noFolds,
    foldSpecs,
    noIntVars: model.mmVariables.filter((v) => !isInteraction(v)),
    endogenous: model.smMatrix.allEndogenous(),
  };
}

/** The fold context runPredictFold needs, drawn from the fitted model. */
export function predictFoldContext(model: PlsModel, plan: PredictPlan): PredictFoldContext {
  return {
    data: model.data,
    measurementModel: model.measurementModel,
    structuralModel: model.smMatrix,
    options: {
      innerWeights: model.innerWeights,
      missing: model.missing,
      missingValue: model.settings.missingValue,
      maxIt: model.settings.maxIt,
      stopCriterion: model.settings.stopCriterion,
    },
    technique: plan.technique,
    noIntVars: plan.noIntVars,
    endogenous: plan.endogenous,
  };
}

function toNamed(rows: number, cols: readonly string[], values: number[][]): NamedMatrix {
  return namedMatrix(
    Array.from({ length: rows }, (_, i) => String(i + 1)),
    cols,
    values,
  );
}

function subtract(a: NamedMatrix, b: NamedMatrix): NamedMatrix {
  return namedMatrix(
    a.rows,
    a.cols,
    a.values.map((row, i) => row.map((v, j) => v - b.values[i]![j]!)),
  );
}

/** Scatter per-fold results back to original row order and build the result object. */
export function assemblePrediction(
  model: PlsModel,
  plan: PredictPlan,
  results: readonly PredictFoldResult[],
): PlsPrediction {
  const { noFolds, foldSpecs, noIntVars, endogenous } = plan;
  const n = model.data.values.length;
  const endogenousItems = endogenous.flatMap((c) => model.mmMatrix.constructItems(c));

  const zeros = (cols: number): number[][] =>
    Array.from({ length: n }, () => new Array<number>(cols).fill(0));
  const oosConstruct = zeros(model.constructs.length);
  const isConstructSum = zeros(model.constructs.length);
  const oosItem = zeros(noIntVars.length);
  const isItemSum = zeros(noIntVars.length);
  const lmOos = zeros(endogenousItems.length);
  const lmIsSum = zeros(endogenousItems.length);

  results.forEach((result, k) => {
    const { trainRows, testRows } = foldSpecs[k]!;
    testRows.forEach((orig, r) => {
      oosConstruct[orig] = result.testScores[r]!;
      oosItem[orig] = result.testItems[r]!;
      lmOos[orig] = result.lmTest[r]!;
    });
    trainRows.forEach((orig, r) => {
      for (let j = 0; j < model.constructs.length; j++) {
        isConstructSum[orig]![j]! += result.trainScores[r]![j]!;
      }
      for (let j = 0; j < noIntVars.length; j++) isItemSum[orig]![j]! += result.trainItems[r]![j]!;
      for (let j = 0; j < endogenousItems.length; j++) lmIsSum[orig]![j]! += result.lmTrain[r]![j]!;
    });
  });

  const meanIs = (m: number[][]): number[][] =>
    m.map((row) => row.map((v) => v / (noFolds - 1)));

  const compositeOutOfSample = toNamed(n, model.constructs, oosConstruct);
  const compositeInSample = toNamed(n, model.constructs, meanIs(isConstructSum));

  const pickColumns = (m: number[][], from: readonly string[], cols: readonly string[]): number[][] => {
    const idx = cols.map((c) => from.indexOf(c));
    return m.map((row) => idx.map((j) => row[j]!));
  };
  const plsOutOfSample = toNamed(n, endogenousItems, pickColumns(oosItem, noIntVars, endogenousItems));
  const plsInSample = toNamed(
    n,
    endogenousItems,
    pickColumns(meanIs(isItemSum), noIntVars, endogenousItems),
  );
  const lmOutOfSample = toNamed(n, endogenousItems, lmOos);
  const lmInSample = toNamed(n, endogenousItems, meanIs(lmIsSum));

  const actualEndogenous = toNamed(
    n,
    endogenousItems,
    selectColumns(model.data, endogenousItems).values.map((row) => [...row]),
  );
  const itemActuals = toNamed(
    n,
    model.mmVariables,
    selectColumns(model.data, model.mmVariables).values.map((row) => [...row]),
  );

  return {
    kind: "predict_pls",
    composites: {
      compositeOutOfSample,
      compositeInSample,
      actualsStar: model.constructScores,
    },
    items: {
      plsOutOfSample,
      plsInSample,
      lmOutOfSample,
      lmInSample,
      itemActuals,
      plsOutOfSampleResiduals: subtract(actualEndogenous, plsOutOfSample),
      plsInSampleResiduals: subtract(actualEndogenous, plsInSample),
      lmOutOfSampleResiduals: subtract(actualEndogenous, lmOutOfSample),
      lmInSampleResiduals: subtract(actualEndogenous, lmInSample),
    },
    model,
  };
}

/** Named-argument form of {@link predictPls} (`model` mirrors R's argument). */
export interface PredictPlsArgs extends PredictPlsOptions {
  model: PlsModel;
}

/** Cross-validated PLS predictions, as seminr's `predict_pls()`. */
export function predictPls(args: PredictPlsArgs): PlsPrediction;
export function predictPls(model: PlsModel, options?: PredictPlsOptions): PlsPrediction;
export function predictPls(
  modelOrArgs: PlsModel | PredictPlsArgs,
  positionalOptions: PredictPlsOptions = {},
): PlsPrediction {
  const named = "model" in modelOrArgs;
  const model = named ? (modelOrArgs as PredictPlsArgs).model : (modelOrArgs as PlsModel);
  const options = named ? (modelOrArgs as PredictPlsArgs) : positionalOptions;

  const plan = resolvePredictPlan(model, options);
  const context = predictFoldContext(model, plan);
  const results = plan.foldSpecs.map((spec) => runPredictFold(context, spec));
  return assemblePrediction(model, plan, results);
}

function defaultShuffle(n: number, seed: number | undefined): number[] {
  const rng = mulberry32(seed ?? Math.floor(Math.random() * 100000));
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}
