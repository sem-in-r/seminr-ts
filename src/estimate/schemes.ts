/**
 * Outer (measurement) mode functions and inner weighting schemes
 * (seminr library.R:22-61, 132-188, 315-317).
 */

import { cov, cor, colCor } from "../math/stats.ts";
import { solve, ols } from "../math/solve.ts";
import { namedMatrix, nmSet, type NamedMatrix } from "../math/matrix.ts";
import { constructItems, isModeB, isUnitWeighted, type MMMatrix } from "../model/mmMatrix.ts";
import { constructAntecedents } from "../model/smMatrix.ts";
import type { SMMatrix } from "../specify/relationships.ts";
import { getColumn, selectColumns, type ColumnMatrix } from "./data.ts";

/** Computes one construct's outer weights from normalized data and current scores. */
export type OuterModeFn = (
  mmMatrix: MMMatrix,
  construct: string,
  normData: ColumnMatrix,
  constructScores: ColumnMatrix,
) => number[];

/** Mode A: covariance of each item with the construct score. */
export const modeA: OuterModeFn = (mmMatrix, construct, normData, constructScores) => {
  const score = getColumn(constructScores, construct);
  return constructItems(mmMatrix, construct).map((item) => cov(getColumn(normData, item), score));
};

/** Mode B: solve(cor(items), cor(items, score)). */
export const modeB: OuterModeFn = (mmMatrix, construct, normData, constructScores) => {
  const items = constructItems(mmMatrix, construct);
  const itemData = selectColumns(normData, items);
  const itemCors = colCor(itemData.values, itemData.values);
  const score = getColumn(constructScores, construct);
  const itemScoreCors = items.map((item) => cor(getColumn(normData, item), score));
  return solve(itemCors, itemScoreCors);
};

/** Unit weights: all ones. */
export const unitWeightsFn: OuterModeFn = (mmMatrix, construct) =>
  constructItems(mmMatrix, construct).map(() => 1);

/**
 * Map a construct to its outer mode function, as seminr's `construct_mode_fn`:
 * reflective (C) and mode A families use mode_A; B families use mode_B; UNIT uses unit weights.
 */
export function constructModeFn(mmMatrix: MMMatrix, construct: string): OuterModeFn {
  if (isModeB(mmMatrix, construct)) return modeB;
  if (isUnitWeighted(mmMatrix, construct)) return unitWeightsFn;
  return modeA;
}

/** Computes the inner paths matrix from current construct scores. */
export type InnerWeightsFn = (
  smMatrix: SMMatrix,
  constructScores: ColumnMatrix,
  dependant: readonly string[],
  pathsMatrix: NamedMatrix,
) => NamedMatrix;

function scoreCorrelations(constructScores: ColumnMatrix): number[][] {
  return colCor(constructScores.values, constructScores.values);
}

/**
 * Path weighting scheme: correlations on outgoing cells (transposed paths mask),
 * OLS betas on incoming cells.
 */
export const pathWeighting: InnerWeightsFn = (smMatrix, constructScores, dependant, pathsMatrix) => {
  const names = pathsMatrix.rows;
  const cors = scoreCorrelations(constructScores);
  const inner = namedMatrix(names, names);
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      // t(paths_matrix) mask: cell [i][j] survives when there is a path j -> i
      inner.values[i]![j] = cors[i]![j]! * pathsMatrix.values[j]![i]!;
    }
  }
  for (const dv of dependant) {
    const antecedents = constructAntecedents(smMatrix, dv);
    const x = selectColumns(constructScores, antecedents).values;
    const y = getColumn(constructScores, dv);
    const betas = ols(x, y);
    antecedents.forEach((iv, k) => nmSet(inner, iv, dv, betas[k]!));
  }
  return inner;
};

/** Factorial scheme: symmetric correlations masked by paths + t(paths). */
export const pathFactorial: InnerWeightsFn = (_smMatrix, constructScores, _dependant, pathsMatrix) => {
  const names = pathsMatrix.rows;
  const cors = scoreCorrelations(constructScores);
  const inner = namedMatrix(names, names);
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      const mask = pathsMatrix.values[i]![j]! + pathsMatrix.values[j]![i]!;
      inner.values[i]![j] = cors[i]![j]! * mask;
    }
  }
  return inner;
};
