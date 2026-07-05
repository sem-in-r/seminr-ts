/**
 * Outer (measurement) mode functions and inner weighting schemes
 * (seminr library.R:22-61, 132-188, 315-317).
 */

import { cov, cor, colCor, mean, sd } from "../math/stats.ts";
import { solve, olsColumns } from "../math/solve.ts";
import { namedMatrix, nmSet, type NamedMatrix } from "../math/matrix.ts";
import type { MmMatrix } from "../model/mmMatrix.ts";
import type { SmMatrix } from "../model/smMatrix.ts";
import { getColumn, selectColumns, type ColumnMatrix } from "./data.ts";

/** Computes one construct's outer weights from normalized data and current scores. */
export type OuterModeFn = (
  mmMatrix: MmMatrix,
  construct: string,
  normData: ColumnMatrix,
  constructScores: ColumnMatrix,
) => number[];

/** Mode A: covariance of each item with the construct score. */
export const modeA: OuterModeFn = (mmMatrix, construct, normData, constructScores) => {
  const score = getColumn(constructScores, construct);
  return mmMatrix.constructItems(construct).map((item) => cov(getColumn(normData, item), score));
};

/** Mode B: solve(cor(items), cor(items, score)). */
export const modeB: OuterModeFn = (mmMatrix, construct, normData, constructScores) => {
  const items = mmMatrix.constructItems(construct);
  const itemData = selectColumns(normData, items);
  const itemCors = colCor(itemData.values, itemData.values);
  const score = getColumn(constructScores, construct);
  const itemScoreCors = items.map((item) => cor(getColumn(normData, item), score));
  return solve(itemCors, itemScoreCors);
};

/** Unit weights: all ones. */
export const unitWeightsFn: OuterModeFn = (mmMatrix, construct) =>
  mmMatrix.constructItems(construct).map(() => 1);

/**
 * Map a construct to its outer mode function, as seminr's `construct_mode_fn`:
 * reflective (C) and mode A families use mode_A; B families use mode_B; UNIT uses unit weights.
 */
export function constructModeFn(mmMatrix: MmMatrix, construct: string): OuterModeFn {
  if (mmMatrix.isModeB(construct)) return modeB;
  if (mmMatrix.isUnitWeighted(construct)) return unitWeightsFn;
  return modeA;
}

/**
 * Iteration-invariant preparation of a builtin outer mode for one construct.
 * Returns a closure over the construct's (fixed) normData item columns taking
 * only the construct's current score column; returns null for custom mode
 * functions (callers fall back to invoking the {@link OuterModeFn} directly).
 *
 * The closures reproduce their builtin bit-for-bit: item column means/SDs and
 * mode-B item correlations are hoisted (identical values every iteration,
 * since normData never changes inside the PLS loop), while the per-item
 * cov/cor accumulations keep the original expressions and grouping.
 */
export function prepareBuiltinOuterMode(
  fn: OuterModeFn,
  mmMatrix: MmMatrix,
  construct: string,
  normData: ColumnMatrix,
): ((scoreColumn: readonly number[]) => number[]) | null {
  const items = mmMatrix.constructItems(construct);
  if (fn === unitWeightsFn) return () => items.map(() => 1);
  if (fn !== modeA && fn !== modeB) return null;

  const n = normData.values.length;
  const itemCols = items.map((item) => getColumn(normData, item));
  const itemMeans = itemCols.map(mean);
  // cov() with both means precomputed; the accumulation loop is unchanged
  const covWith = (x: readonly number[], mx: number, y: readonly number[], my: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += (x[i]! - mx) * (y[i]! - my);
    return s / (n - 1);
  };

  if (fn === modeA) {
    return (score) => {
      const scoreMean = mean(score);
      return itemCols.map((col, k) => covWith(col, itemMeans[k]!, score, scoreMean));
    };
  }

  // mode B: item correlations are iteration-invariant; solve() copies its
  // inputs, so itemCors is safe to reuse across iterations
  const itemData = selectColumns(normData, items);
  const itemCors = colCor(itemData.values, itemData.values);
  const itemSds = itemCols.map(sd);
  return (score) => {
    const scoreMean = mean(score);
    const scoreSd = sd(score);
    const itemScoreCors = itemCols.map(
      (col, k) => covWith(col, itemMeans[k]!, score, scoreMean) / (itemSds[k]! * scoreSd),
    );
    return solve(itemCors, itemScoreCors);
  };
}

/** Computes the inner paths matrix from current construct scores. */
export type InnerWeightsFn = (
  smMatrix: SmMatrix,
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
  // each score column is extracted once and shared across the DV regressions
  const columnCache = new Map<string, number[]>();
  const scoreColumn = (name: string): number[] => {
    let col = columnCache.get(name);
    if (!col) {
      col = getColumn(constructScores, name);
      columnCache.set(name, col);
    }
    return col;
  };
  for (const dv of dependant) {
    const antecedents = smMatrix.constructAntecedents(dv);
    const betas = olsColumns(antecedents.map(scoreColumn), scoreColumn(dv));
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
