/**
 * Single-shot PLS prediction core, shared by the cross-validated `predictPls`
 * (per fold) and the public direct out-of-sample `predict`, as seminr's
 * `predict.seminr_model` (feature_plspredict.R:375-401) with the prediction
 * chain and interaction predict paths of feature_plspredict.R:60-286.
 */

import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import { mean, sd } from "../math/stats.ts";
import { estimatePls, type PlsModel } from "../estimate/estimatePls.ts";
import { rerun } from "../estimate/rerun.ts";
import { getColumn, selectColumns, type Dataset } from "../estimate/data.ts";
import { isInteraction } from "../model/smMatrix.ts";
import { interactionSpecs, nonInteractionSpecs } from "../specify/constructs.ts";
import { predictDA, type PredictTechnique } from "./techniques.ts";

/** Standardize columns of `data` (selected by name) using stored means/sds. */
export function standardizeBy(
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

export interface ModelPredictions {
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
export function predictOnData(
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

/**
 * Reference construct scores: replace the test rows inside the model's data
 * and re-estimate the full model with the same settings, as seminr's
 * `compute_actual_star` (feature_plspredict.R:34-59).
 */
function computeActualStar(
  model: PlsModel,
  testData: Dataset,
  testRowIndices: readonly number[],
  noIntVars: readonly string[],
): NamedMatrix {
  const testIdx = noIntVars.map((v) => testData.columns.indexOf(v));
  const patched = selectColumns(model.data, noIntVars);
  testRowIndices.forEach((row, r) => {
    patched.values[row] = testIdx.map((j) => testData.values[r]![j]!);
  });
  return rerun(model, { data: patched }).constructScores;
}

export interface PredictModelOptions {
  technique?: PredictTechnique;
  /**
   * 0-based rows of the model's data that `testData` replaces when computing
   * the reference construct scores (seminr indexes by testData rownames).
   * Defaults to the first `testData.values.length` rows.
   */
  testRowIndices?: readonly number[];
}

/**
 * Direct-prediction result, mirroring seminr's `predicted_seminr_model`
 * field-for-field except its `testData` echo (the caller already owns it).
 */
export interface PredictedModel {
  readonly kind: "predicted_model";
  /** Predicted non-interaction items, unstandardized. */
  readonly predictedItems: NamedMatrix;
  /** testData minus predictedItems. */
  readonly itemResiduals: NamedMatrix;
  /** Predicted standardized construct scores (all constructs). */
  readonly predictedCompositeScores: NamedMatrix;
  /** actualStar minus predictedCompositeScores. */
  readonly compositeResiduals: NamedMatrix;
  /** Reference construct scores from the re-estimated full model. */
  readonly actualStar: NamedMatrix;
}

/**
 * Direct out-of-sample prediction on user-supplied test data (no
 * cross-validation), as seminr's `predict(model, testData, technique)`.
 */
export function predict(
  model: PlsModel,
  testData: Dataset,
  options: PredictModelOptions = {},
): PredictedModel {
  if (model.hoc) {
    throw new Error("There is no published solution for applying PLSpredict to higher-order models");
  }
  const technique = options.technique ?? predictDA;
  const m = testData.values.length;
  const n = model.data.values.length;
  const testRowIndices = options.testRowIndices ?? Array.from({ length: m }, (_, i) => i);
  if (
    testRowIndices.length !== m ||
    new Set(testRowIndices).size !== m ||
    testRowIndices.some((i) => !Number.isInteger(i) || i < 0 || i >= n)
  ) {
    throw new Error(
      `testRowIndices must be ${m} distinct 0-based rows of the model data (n = ${n})`,
    );
  }

  const noIntVars = model.mmVariables.filter((v) => !isInteraction(v));
  const rowNames = testRowIndices.map((i) => String(i + 1));

  const fullScores = computeActualStar(model, testData, testRowIndices, noIntVars);
  const actualStar = namedMatrix(
    rowNames,
    fullScores.cols,
    testRowIndices.map((row) => [...fullScores.values[row]!]),
  );

  const { scores, items } = predictOnData(model, testData, technique, noIntVars);
  const predictedItems = namedMatrix(rowNames, noIntVars, items);
  const predictedCompositeScores = namedMatrix(rowNames, model.constructs, scores);

  const testIdx = noIntVars.map((v) => testData.columns.indexOf(v));
  const itemResiduals = namedMatrix(
    rowNames,
    noIntVars,
    testData.values.map((row, r) => testIdx.map((j, p) => row[j]! - items[r]![p]!)),
  );
  const compositeResiduals = namedMatrix(
    rowNames,
    model.constructs,
    actualStar.values.map((row, r) => row.map((v, j) => v - scores[r]![j]!)),
  );

  return {
    kind: "predicted_model",
    predictedItems,
    itemResiduals,
    predictedCompositeScores,
    compositeResiduals,
    actualStar,
  };
}
