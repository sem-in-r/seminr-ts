/**
 * PLSpredict: k-fold / LOOCV cross-validated predictions for a PLS model,
 * as seminr's `predict_pls` (feature_plspredict.R:481-545) with the per-fold
 * machinery of `in_and_out_sample_predictions` (:600-673), the interaction
 * predict paths (:119-286), and the LM benchmark (:813-867).
 */

import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import { ols } from "../math/solve.ts";
import { mean, sd } from "../math/stats.ts";
import { estimatePls, type PlsModel } from "../estimate/estimatePls.ts";
import { getColumn, selectColumns, type Dataset } from "../estimate/data.ts";
import { isInteraction } from "../model/smMatrix.ts";
import { interactionSpecs, nonInteractionSpecs } from "../specify/constructs.ts";
import { mulberry32 } from "../bootstrap/rng.ts";
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

function selectRows(data: Dataset, rows: readonly number[]): Dataset {
  return { columns: data.columns, values: rows.map((r) => [...data.values[r]!]) };
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

/** Standardize columns of `data` (selected by name) using stored means/sds. */
function standardizeBy(
  data: Dataset,
  columns: readonly string[],
  means: Record<string, number>,
  sds: Record<string, number>,
): number[][] {
  const idx = columns.map((c) => {
    const j = data.columns.indexOf(c);
    if (j === -1) throw new Error(`Prediction data is missing column ${c}`);
    return j;
  });
  return data.values.map((row) =>
    columns.map((c, p) => (row[idx[p]!]! - means[c]!) / sds[c]!),
  );
}

function parseInteraction(name: string): { iv: string; moderator: string } {
  const star = name.indexOf("*");
  return { iv: name.slice(0, star), moderator: name.slice(star + 1) };
}

/**
 * Recreate product-indicator items for test data using the TRAINING data's
 * item means/sds (feature_plspredict.R:183-217); iv-major column naming.
 */
function createPiItems(model: PlsModel, testData: Dataset, interaction: string): Dataset {
  const { iv, moderator } = parseInteraction(interaction);
  const ivItems = model.mmMatrix.constructItems(iv);
  const modItems = model.mmMatrix.constructItems(moderator);
  const trainStats = (items: readonly string[]): { means: Record<string, number>; sds: Record<string, number> } => {
    const means: Record<string, number> = {};
    const sds: Record<string, number> = {};
    for (const item of items) {
      const col = getColumn(model.rawdata, item);
      means[item] = mean(col);
      sds[item] = sd(col);
    }
    return { means, sds };
  };
  const ivStats = trainStats(ivItems);
  const modStats = trainStats(modItems);
  const scaledIv = standardizeBy(testData, ivItems, ivStats.means, ivStats.sds);
  const scaledMod = standardizeBy(testData, modItems, modStats.means, modStats.sds);

  const columns: string[] = [];
  for (const a of ivItems) for (const b of modItems) columns.push(`${a}*${b}`);
  const values = testData.values.map((_, r) => {
    const row: number[] = [];
    for (let i = 0; i < ivItems.length; i++) {
      for (let j = 0; j < modItems.length; j++) row.push(scaledIv[r]![i]! * scaledMod[r]![j]!);
    }
    return row;
  });
  return { columns, values };
}

/** Orthogonalize recreated products with the coefficients stored at estimation time. */
function createOrthoItems(model: PlsModel, testData: Dataset, interaction: string): Dataset {
  const params = model.interactionParams?.[interaction];
  if (!params?.orthoCoefs) {
    throw new Error(`Model does not carry orthogonalization coefficients for ${interaction}`);
  }
  const products = createPiItems(model, testData, interaction);
  const { iv, moderator } = parseInteraction(interaction);
  const predictors = [
    ...model.mmMatrix.constructItems(iv),
    ...model.mmMatrix.constructItems(moderator),
  ];
  const predictorIdx = predictors.map((p) => testData.columns.indexOf(p));
  products.columns.forEach((column, j) => {
    const coefs = params.orthoCoefs![column]!;
    testData.values.forEach((row, r) => {
      let fitted = coefs["(Intercept)"]!;
      predictors.forEach((p, k) => {
        fitted += row[predictorIdx[k]!]! * coefs[p]!;
      });
      products.values[r]![j] = products.values[r]![j]! - fitted;
    });
  });
  return products;
}

/**
 * Two-stage augmentation: re-estimate the main-effects model on the training
 * data, score the test data with its weights, and take construct-score
 * products as the interaction indicators (feature_plspredict.R:130-159).
 */
function createTwoStageItems(
  model: PlsModel,
  testData: Dataset,
  interactions: readonly string[],
  noIntVars: readonly string[],
): Dataset {
  const firstStageMm = nonInteractionSpecs(model.measurementModel);
  const firstStageSm = model.structuralModel.removePathsFrom(interactions);
  // seminr re-estimates the first stage with default settings
  const firstStage = estimatePls(model.rawdata, firstStageMm, firstStageSm);
  const scaled = standardizeBy(testData, noIntVars, firstStage.meanData, firstStage.sdData);
  const weightRows = noIntVars.map((v) => firstStage.outerWeights.rows.indexOf(v));
  const scores = testData.values.map((_, r) =>
    firstStage.constructs.map((_, j) => {
      let s = 0;
      for (let p = 0; p < noIntVars.length; p++) {
        s += scaled[r]![p]! * firstStage.outerWeights.values[weightRows[p]!]![j]!;
      }
      return s;
    }),
  );
  const columns: string[] = [];
  const values: number[][] = testData.values.map(() => []);
  for (const interaction of interactions) {
    const { iv, moderator } = parseInteraction(interaction);
    const ivIdx = firstStage.constructs.indexOf(iv);
    const modIdx = firstStage.constructs.indexOf(moderator);
    columns.push(`${interaction}_intxn`);
    scores.forEach((row, r) => values[r]!.push(row[ivIdx]! * row[modIdx]!));
  }
  return { columns, values };
}

function appendColumns(data: Dataset, extra: Dataset): Dataset {
  return {
    columns: [...data.columns, ...extra.columns],
    values: data.values.map((row, r) => [...row, ...extra.values[r]!]),
  };
}

interface ModelPredictions {
  /** Predicted construct scores (cols = model constructs). */
  scores: number[][];
  /** Predicted (unstandardized) non-interaction items. */
  items: number[][];
}

/** The W x B x L^T prediction chain over augmented test data (feature_plspredict.R:75-112). */
function predictFromAugmented(
  model: PlsModel,
  augmented: Dataset,
  technique: PredictTechnique,
  noIntVars: readonly string[],
): ModelPredictions {
  const vars = model.mmVariables;
  const scaled = standardizeBy(augmented, vars, model.meanData, model.sdData);
  const weightRows = vars.map((v) => model.outerWeights.rows.indexOf(v));
  const scoreValues = scaled.map((row) =>
    model.constructs.map((_, j) => {
      let s = 0;
      for (let p = 0; p < vars.length; p++) s += row[p]! * model.outerWeights.values[weightRows[p]!]![j]!;
      return s;
    }),
  );
  const rowNames = scoreValues.map((_, r) => String(r + 1));
  const predicted = technique(
    model.smMatrix,
    model.pathCoef,
    namedMatrix(rowNames, model.constructs, scoreValues),
  );
  const measurements = predicted.values.map((row) => {
    const loadingsT = model.outerLoadings; // items x constructs
    return noIntVars.map((item) => {
      const i = loadingsT.rows.indexOf(item);
      let s = 0;
      for (let j = 0; j < model.constructs.length; j++) s += row[j]! * loadingsT.values[i]![j]!;
      return s * model.sdData[item]! + model.meanData[item]!;
    });
  });
  return { scores: predicted.values, items: measurements };
}

/** Detect the (single) interaction method used by the model's measurement model. */
function interactionMethod(model: PlsModel): "product_indicator" | "orthogonal" | "two_stage" {
  const methods = [
    ...new Set(interactionSpecs(model.measurementModel).map((s) => s.methodName ?? "unknown")),
  ];
  if (methods.length > 1) {
    throw new Error(
      `Mixed interaction methods (${methods.join(", ")}) are not supported for prediction.`,
    );
  }
  const method = methods[0]!;
  if (method === "unknown") throw new Error("Unknown interaction method for prediction");
  return method;
}

/** Predict a fitted model on held-out rows, recreating interaction columns as needed. */
function predictModel(
  model: PlsModel,
  testData: Dataset,
  technique: PredictTechnique,
  noIntVars: readonly string[],
): ModelPredictions {
  const interactions = model.constructs.filter(isInteraction);
  let augmented = testData;
  if (interactions.length > 0) {
    const method = interactionMethod(model);
    if (method === "two_stage") {
      augmented = appendColumns(
        testData,
        createTwoStageItems(model, testData, interactions, noIntVars),
      );
    } else {
      // seminr rebuilds these from the non-interaction test columns only, so
      // recreated products replace any product columns carried in testData
      const build = method === "orthogonal" ? createOrthoItems : createPiItems;
      let extra: Dataset | undefined;
      for (const interaction of interactions) {
        const cols = build(model, testData, interaction);
        extra = extra ? appendColumns(extra, cols) : cols;
      }
      augmented = appendColumns(selectColumns(testData, noIntVars), extra!);
    }
  }
  return predictFromAugmented(model, augmented, technique, noIntVars);
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
  model: PlsModel,
  dataMm: Dataset,
  dv: string,
  trainRows: readonly number[],
  testRows: readonly number[],
  technique: PredictTechnique,
): LmPredictions {
  const depItems = model.mmMatrix.constructItems(dv);
  const indepConstructs =
    technique === predictDA ? model.smMatrix.constructAntecedents(dv) : model.smMatrix.onlyExogenous();
  const indepItems = indepConstructs.flatMap((c) => model.mmMatrix.constructItems(c));
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

  if (model.hoc) {
    throw new Error("There is no published solution for applying PLSpredict to higher-order models");
  }

  const technique = options.technique ?? predictDA;
  const n = model.data.values.length;
  const noFolds = options.noFolds ?? n; // LOOCV by default, as seminr
  const ordering = options.ordering ?? defaultShuffle(n, options.seed);
  if (ordering.length !== n) throw new Error("ordering must be a permutation of all data rows");
  const folds = cutFolds(n, noFolds);

  const noIntVars = model.mmVariables.filter((v) => !isInteraction(v));
  const endogenous = model.smMatrix.allEndogenous();
  const endogenousItems = endogenous.flatMap((c) => model.mmMatrix.constructItems(c));

  const zeros = (cols: number): number[][] =>
    Array.from({ length: n }, () => new Array<number>(cols).fill(0));
  const oosConstruct = zeros(model.constructs.length);
  const isConstructSum = zeros(model.constructs.length);
  const oosItem = zeros(noIntVars.length);
  const isItemSum = zeros(noIntVars.length);
  const lmOos = zeros(endogenousItems.length);
  const lmIsSum = zeros(endogenousItems.length);

  for (let fold = 1; fold <= noFolds; fold++) {
    const testRows: number[] = [];
    const trainRows: number[] = [];
    folds.forEach((f, pos) => (f === fold ? testRows : trainRows).push(ordering[pos]!));

    const trainingData = selectRows(model.data, trainRows);
    const testingData = selectRows(model.data, testRows);
    const trainModel = estimatePls(trainingData, model.measurementModel, model.smMatrix, {
      innerWeights: model.innerWeights,
      missing: model.missing,
      missingValue: model.settings.missingValue,
      maxIt: model.settings.maxIt,
      stopCriterion: model.settings.stopCriterion,
    });

    const testPred = predictModel(trainModel, testingData, technique, noIntVars);
    const trainPred = predictModel(trainModel, trainingData, technique, noIntVars);
    testRows.forEach((orig, r) => {
      oosConstruct[orig] = testPred.scores[r]!;
      oosItem[orig] = testPred.items[r]!;
    });
    trainRows.forEach((orig, r) => {
      for (let j = 0; j < model.constructs.length; j++) {
        isConstructSum[orig]![j]! += trainPred.scores[r]![j]!;
      }
      for (let j = 0; j < noIntVars.length; j++) isItemSum[orig]![j]! += trainPred.items[r]![j]!;
    });

    let itemOffset = 0;
    for (const dv of endogenous) {
      const lm = lmPredictions(model, model.data, dv, trainRows, testRows, technique);
      testRows.forEach((orig, r) => {
        lm.items.forEach((_, d) => {
          lmOos[orig]![itemOffset + d] = lm.outSample[r]![d]!;
        });
      });
      trainRows.forEach((orig, r) => {
        lm.items.forEach((_, d) => {
          lmIsSum[orig]![itemOffset + d]! += lm.inSample[r]![d]!;
        });
      });
      itemOffset += lm.items.length;
    }
  }

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
