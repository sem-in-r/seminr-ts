/** Core simplePLS estimation loop (seminr estimate_simplePLS.R:73-199). */

import { standardize, standardizeInPlace, colCov, colCor, sd } from "../math/stats.ts";
import { matmul, namedMatrix, nmSet, zeros, type NamedMatrix, type Matrix } from "../math/matrix.ts";
import { inverse, olsColumns } from "../math/solve.ts";
import type { MmMatrix } from "../model/mmMatrix.ts";
import { isInteraction, type SmMatrix } from "../model/smMatrix.ts";
import { getColumn, selectColumns, type ColumnMatrix, type Dataset } from "./data.ts";
import {
  constructModeFn,
  pathWeighting,
  prepareBuiltinOuterMode,
  type InnerWeightsFn,
  type OuterModeFn,
} from "./schemes.ts";
import { DEFAULT_MAX_IT, DEFAULT_STOP_CRITERION } from "./constants.ts";

export interface SimplePlsOptions {
  innerWeights?: InnerWeightsFn;
  maxIt?: number;
  stopCriterion?: number;
  /** Override the per-construct outer mode functions (defaults derive from mmMatrix types). */
  measurementModeScheme?: Record<string, OuterModeFn>;
}

export interface SimplePlsModel {
  readonly meanData: Record<string, number>;
  readonly sdData: Record<string, number>;
  readonly smMatrix: SmMatrix;
  readonly mmMatrix: MmMatrix;
  readonly constructs: string[];
  readonly mmVariables: string[];
  readonly outerLoadings: NamedMatrix;
  readonly outerWeights: NamedMatrix;
  readonly pathCoef: NamedMatrix;
  readonly iterations: number;
  readonly weightDiff: number;
  readonly constructScores: NamedMatrix;
  readonly rSquared: NamedMatrix;
  readonly innerWeights: InnerWeightsFn;
}

/** Items-by-constructs 0/1 membership matrix. */
export function initialOuterWeights(
  mmMatrix: MmMatrix,
  mmVariables: readonly string[],
  constructs: readonly string[],
): NamedMatrix {
  const w = namedMatrix(mmVariables, constructs);
  for (const construct of constructs) {
    for (const item of mmMatrix.constructItems(construct)) nmSet(w, item, construct, 1);
  }
  return w;
}

/** Constructs-by-constructs 0/1 matrix with 1 at [source, target]. */
export function initialPathsMatrix(smMatrix: SmMatrix, constructs: readonly string[]): NamedMatrix {
  const p = namedMatrix(constructs, constructs);
  for (const target of constructs) {
    for (const source of smMatrix.constructAntecedents(target)) nmSet(p, source, target, 1);
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
  mmMatrix: MmMatrix,
  outerLoadings: NamedMatrix,
  scores: ColumnMatrix,
  obsData: Dataset,
): void {
  for (const construct of constructs) {
    if (!isInteraction(construct)) continue;
    let adjustment = 0;
    let denom = 0;
    for (const item of mmMatrix.constructItems(construct)) {
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
  smMatrix: SmMatrix,
  scores: ColumnMatrix,
  dependant: readonly string[],
  pathsMatrix: NamedMatrix,
): NamedMatrix {
  const coef = namedMatrix(pathsMatrix.rows, pathsMatrix.cols, pathsMatrix.values.map((r) => [...r]));
  for (const dv of dependant) {
    const antecedents = smMatrix.constructAntecedents(dv);
    const betas = olsColumns(
      antecedents.map((a) => getColumn(scores, a)),
      getColumn(scores, dv),
    );
    antecedents.forEach((iv, k) => nmSet(coef, iv, dv, betas[k]!));
  }
  return coef;
}

/** R² and adjusted R² per endogenous construct (evaluate_model.R:4-19). */
export function metricsInsample(
  nObs: number,
  smMatrix: SmMatrix,
  dependant: readonly string[],
  scoreCors: NamedMatrix,
): NamedMatrix {
  const out = namedMatrix(["Rsq", "AdjRsq"], dependant);
  for (const dv of dependant) {
    const involved = [...smMatrix.constructAntecedents(dv), dv];
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
  smMatrix: SmMatrix,
  mmMatrix: MmMatrix,
  options: SimplePlsOptions = {},
): SimplePlsModel {
  const {
    innerWeights = pathWeighting,
    maxIt = DEFAULT_MAX_IT,
    stopCriterion = DEFAULT_STOP_CRITERION,
  } = options;

  const constructs = smMatrix.constructNames();
  const constructSet = new Set(constructs);
  const mmOrderedConstructs = mmMatrix.allConstructs().filter((c) => constructSet.has(c));
  const mmVariables = mmOrderedConstructs.flatMap((c) => mmMatrix.constructItems(c));

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

  const dependant = smMatrix.allEndogenous();
  const outerWeights = initialOuterWeights(mmMatrix, mmVariables, constructs);
  const weightsMask = namedMatrix(mmVariables, constructs, outerWeights.values.map((r) => [...r]));
  const pathsMatrix = initialPathsMatrix(smMatrix, constructs);

  const itemIndexOf = new Map(mmVariables.map((v, i) => [v, i]));

  // Iteration-invariant preparation: builtin outer modes close over normData's
  // (fixed) item columns; custom mode functions keep the generic call below.
  const preparedModes = constructs.map((c) =>
    prepareBuiltinOuterMode(modeScheme[c]!, mmMatrix, c, normData),
  );
  const constructItemRows = constructs.map((c) =>
    mmMatrix.constructItems(c).map((item) => itemIndexOf.get(item)!),
  );

  const nObs = normData.values.length;
  const lastWeights = zeros(mmVariables.length, constructs.length);

  let iterations = 0;
  let weightDiff = Number.POSITIVE_INFINITY;
  const threshold = Math.pow(10, -stopCriterion);

  for (iterations = 0; iterations <= maxIt; iterations++) {
    let scoreValues = matmul(normData.values, outerWeights.values);
    standardizeInPlace(scoreValues);

    const innerPaths = innerWeights(
      smMatrix,
      { columns: constructs, values: scoreValues },
      dependant,
      pathsMatrix,
    );
    scoreValues = matmul(scoreValues, innerPaths.values);
    standardizeInPlace(scoreValues);
    const scores: ColumnMatrix = { columns: constructs, values: scoreValues };

    for (let i = 0; i < mmVariables.length; i++) {
      const src = outerWeights.values[i]!;
      const dst = lastWeights[i]!;
      for (let j = 0; j < constructs.length; j++) dst[j] = src[j]!;
    }

    for (let j = 0; j < constructs.length; j++) {
      const prepared = preparedModes[j];
      let newWeights: number[];
      if (prepared) {
        const scoreColumn = new Array<number>(nObs);
        for (let i = 0; i < nObs; i++) scoreColumn[i] = scoreValues[i]![j]!;
        newWeights = prepared(scoreColumn);
      } else {
        newWeights = modeScheme[constructs[j]!]!(mmMatrix, constructs[j]!, normData, scores);
      }
      const rows = constructItemRows[j]!;
      for (let k = 0; k < rows.length; k++) outerWeights.values[rows[k]!]![j] = newWeights[k]!;
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

  // the pre-adjustment loadings pass only feeds adjustInteraction, and both
  // are no-ops without interaction constructs (seminr e33fb49)
  if (constructs.some((c) => isInteraction(c))) {
    const preLoadings = calculateLoadings(weightsMask, finalScoreValues, normData.values);
    adjustInteraction(constructs, mmMatrix, preLoadings, finalScores, obsData);
  }
  const outerLoadings = calculateLoadings(weightsMask, finalScoreValues, normData.values);

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

