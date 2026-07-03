/** Core simplePLS estimation loop (seminr estimate_simplePLS.R:73-199). */

import { standardize, colCov, colCor, sd } from "../math/stats.ts";
import { matmul, namedMatrix, nmSet, type NamedMatrix, type Matrix } from "../math/matrix.ts";
import { inverse, ols } from "../math/solve.ts";
import {
  allConstructs,
  constructItems,
  type MMMatrix,
} from "../model/mmMatrix.ts";
import {
  allEndogenous,
  constructAntecedents,
  constructNames,
  isInteraction,
} from "../model/smMatrix.ts";
import type { SMMatrix } from "../specify/relationships.ts";
import { getColumn, selectColumns, type ColumnMatrix, type Dataset } from "./data.ts";
import { constructModeFn, pathWeighting, type InnerWeightsFn, type OuterModeFn } from "./schemes.ts";
import { DEFAULT_MAX_IT, DEFAULT_STOP_CRITERION } from "./constants.ts";

export interface SimplePlsOptions {
  innerWeights?: InnerWeightsFn;
  maxIt?: number;
  stopCriterion?: number;
  /** Override the per-construct outer mode functions (defaults derive from mmMatrix types). */
  measurementModeScheme?: Record<string, OuterModeFn>;
}

export interface SimplePlsModel {
  meanData: Record<string, number>;
  sdData: Record<string, number>;
  smMatrix: SMMatrix;
  mmMatrix: MMMatrix;
  constructs: string[];
  mmVariables: string[];
  outerLoadings: NamedMatrix;
  outerWeights: NamedMatrix;
  pathCoef: NamedMatrix;
  iterations: number;
  weightDiff: number;
  constructScores: NamedMatrix;
  rSquared: NamedMatrix;
  innerWeights: InnerWeightsFn;
}

/** Items-by-constructs 0/1 membership matrix. */
export function initialOuterWeights(
  mmMatrix: MMMatrix,
  mmVariables: readonly string[],
  constructs: readonly string[],
): NamedMatrix {
  const w = namedMatrix(mmVariables, constructs);
  for (const construct of constructs) {
    for (const item of constructItems(mmMatrix, construct)) nmSet(w, item, construct, 1);
  }
  return w;
}

/** Constructs-by-constructs 0/1 matrix with 1 at [source, target]. */
export function initialPathsMatrix(smMatrix: SMMatrix, constructs: readonly string[]): NamedMatrix {
  const p = namedMatrix(constructs, constructs);
  for (const target of constructs) {
    for (const source of constructAntecedents(smMatrix, target)) nmSet(p, source, target, 1);
  }
  return p;
}

/** Column SDs via R's scale(center = FALSE): sqrt(sum(x^2) / (n - 1)). */
function standardizeOuterWeightsInPlace(normValues: Matrix, weights: NamedMatrix): void {
  const scores = matmul(normValues, weights.values);
  const n = scores.length;
  for (let j = 0; j < weights.cols.length; j++) {
    let ss = 0;
    for (let i = 0; i < n; i++) ss += scores[i]![j]! * scores[i]![j]!;
    const rms = Math.sqrt(ss / (n - 1));
    for (const row of weights.values) row[j] = row[j]! / rms;
  }
}

/** outer_loadings = cov(normData, scores) masked to own-construct cells. */
function calculateLoadings(weightsMask: NamedMatrix, scoreValues: Matrix, normValues: Matrix): NamedMatrix {
  const covs = colCov(normValues, scoreValues);
  const loadings = namedMatrix(weightsMask.rows, weightsMask.cols);
  for (let i = 0; i < weightsMask.rows.length; i++) {
    for (let j = 0; j < weightsMask.cols.length; j++) {
      loadings.values[i]![j] = covs[i]![j]! * weightsMask.values[i]![j]!;
    }
  }
  return loadings;
}

/**
 * Interaction-score variance adjustment (Henseler & Chin 2010, library.R:67-88):
 * scale each interaction construct's scores by a loading-weighted mean of raw item SDs.
 */
export function adjustInteraction(
  constructs: readonly string[],
  mmMatrix: MMMatrix,
  outerLoadings: NamedMatrix,
  scores: ColumnMatrix,
  obsData: Dataset,
): void {
  for (const construct of constructs) {
    if (!isInteraction(construct)) continue;
    let adjustment = 0;
    let denom = 0;
    for (const item of constructItems(mmMatrix, construct)) {
      const loading = Math.abs(
        outerLoadings.values[outerLoadings.rows.indexOf(item)]![outerLoadings.cols.indexOf(construct)]!,
      );
      adjustment += sd(getColumn(obsData, item)) * loading;
      denom += loading;
    }
    const factor = adjustment / denom;
    const j = scores.columns.indexOf(construct);
    for (const row of scores.values) row[j] = row[j]! * factor;
  }
}

/** OLS betas for each endogenous construct written into a copy of the paths matrix. */
export function estimatePathCoef(
  smMatrix: SMMatrix,
  scores: ColumnMatrix,
  dependant: readonly string[],
  pathsMatrix: NamedMatrix,
): NamedMatrix {
  const coef = namedMatrix(pathsMatrix.rows, pathsMatrix.cols, pathsMatrix.values.map((r) => [...r]));
  for (const dv of dependant) {
    const antecedents = constructAntecedents(smMatrix, dv);
    const betas = ols(selectColumns(scores, antecedents).values, getColumn(scores, dv));
    antecedents.forEach((iv, k) => nmSet(coef, iv, dv, betas[k]!));
  }
  return coef;
}

/** R² and adjusted R² per endogenous construct (evaluate_model.R:4-19). */
export function metricsInsample(
  nObs: number,
  smMatrix: SMMatrix,
  dependant: readonly string[],
  scoreCors: NamedMatrix,
): NamedMatrix {
  const out = namedMatrix(["Rsq", "AdjRsq"], dependant);
  for (const dv of dependant) {
    const involved = [...constructAntecedents(smMatrix, dv), dv];
    const idx = involved.map((c) => scoreCors.rows.indexOf(c));
    const sub = idx.map((i) => idx.map((j) => scoreCors.values[i]![j]!));
    const inv = inverse(sub);
    const rsq = 1 - 1 / inv[involved.length - 1]![involved.length - 1]!;
    const p = involved.length - 1;
    nmSet(out, "Rsq", dv, rsq);
    nmSet(out, "AdjRsq", dv, 1 - ((1 - rsq) * (nObs - 1)) / (nObs - p - 1));
  }
  return out;
}

export function simplePls(
  obsData: Dataset,
  smMatrix: SMMatrix,
  mmMatrix: MMMatrix,
  options: SimplePlsOptions = {},
): SimplePlsModel {
  const {
    innerWeights = pathWeighting,
    maxIt = DEFAULT_MAX_IT,
    stopCriterion = DEFAULT_STOP_CRITERION,
  } = options;

  const constructs = constructNames(smMatrix);
  const constructSet = new Set(constructs);
  const mmOrderedConstructs = allConstructs(mmMatrix).filter((c) => constructSet.has(c));
  const mmVariables = mmOrderedConstructs.flatMap((c) => constructItems(mmMatrix, c));

  const modeScheme: Record<string, OuterModeFn> = options.measurementModeScheme ?? {};
  for (const c of constructs) modeScheme[c] ??= constructModeFn(mmMatrix, c);

  const subset = selectColumns(obsData, mmVariables);
  const standardized = standardize(subset.values, mmVariables);
  const normData: ColumnMatrix = { columns: mmVariables, values: standardized.values };
  const meanData: Record<string, number> = {};
  const sdData: Record<string, number> = {};
  mmVariables.forEach((v, j) => {
    meanData[v] = standardized.means[j]!;
    sdData[v] = standardized.sds[j]!;
  });

  const dependant = allEndogenous(smMatrix);
  const outerWeights = initialOuterWeights(mmMatrix, mmVariables, constructs);
  const weightsMask = namedMatrix(mmVariables, constructs, outerWeights.values.map((r) => [...r]));
  const pathsMatrix = initialPathsMatrix(smMatrix, constructs);

  const itemIndexOf = new Map(mmVariables.map((v, i) => [v, i]));
  const constructIndexOf = new Map(constructs.map((c, j) => [c, j]));

  let iterations = 0;
  let weightDiff = Number.POSITIVE_INFINITY;
  const threshold = Math.pow(10, -stopCriterion);

  for (iterations = 0; iterations <= maxIt; iterations++) {
    let scoreValues = standardize(matmul(normData.values, outerWeights.values)).values;
    let scores: ColumnMatrix = { columns: constructs, values: scoreValues };

    const innerPaths = innerWeights(smMatrix, scores, dependant, pathsMatrix);
    scoreValues = standardize(matmul(scoreValues, innerPaths.values)).values;
    scores = { columns: constructs, values: scoreValues };

    const lastWeights = outerWeights.values.map((r) => [...r]);

    for (const construct of constructs) {
      const newWeights = modeScheme[construct]!(mmMatrix, construct, normData, scores);
      const j = constructIndexOf.get(construct)!;
      constructItems(mmMatrix, construct).forEach((item, k) => {
        outerWeights.values[itemIndexOf.get(item)!]![j] = newWeights[k]!;
      });
    }

    standardizeOuterWeightsInPlace(normData.values, outerWeights);

    weightDiff = 0;
    for (let i = 0; i < mmVariables.length; i++) {
      for (let j = 0; j < constructs.length; j++) {
        weightDiff += Math.abs(outerWeights.values[i]![j]! - lastWeights[i]![j]!);
      }
    }
    if (weightDiff < threshold) break;
  }
  if (iterations > maxIt) iterations = maxIt; // loop exhausted without convergence

  const finalScoreValues = matmul(normData.values, outerWeights.values);
  const finalScores: ColumnMatrix = { columns: constructs, values: finalScoreValues };

  let outerLoadings = calculateLoadings(weightsMask, finalScoreValues, normData.values);
  adjustInteraction(constructs, mmMatrix, outerLoadings, finalScores, obsData);
  outerLoadings = calculateLoadings(weightsMask, finalScoreValues, normData.values);

  const pathCoef = estimatePathCoef(smMatrix, finalScores, dependant, pathsMatrix);

  const scoreCors = namedMatrix(constructs, constructs, colCor(finalScoreValues, finalScoreValues));
  const rSquared = metricsInsample(obsData.values.length, smMatrix, dependant, scoreCors);

  const rowNames = finalScoreValues.map((_, i) => String(i + 1));
  const constructScores = namedMatrix(rowNames, constructs, finalScoreValues);

  return {
    meanData,
    sdData,
    smMatrix,
    mmMatrix,
    constructs,
    mmVariables,
    outerLoadings,
    outerWeights,
    pathCoef,
    iterations,
    weightDiff,
    constructScores,
    rSquared,
    innerWeights,
  };
}

