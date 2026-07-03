/** Linear solving: Gaussian elimination with partial pivoting, and OLS. */

import { matmul, transpose } from "./matrix.ts";

/** Solve A x = b for square A (partial-pivot Gaussian elimination), as R's `solve()`. */
export function solve(a: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = a.length;
  // augmented working copy
  const w = a.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(w[r]![col]!) > Math.abs(w[pivot]![col]!)) pivot = r;
    }
    const pivotVal = w[pivot]![col]!;
    if (pivotVal === 0) throw new Error("Cannot solve: matrix is singular");
    if (pivot !== col) {
      const tmp = w[col]!;
      w[col] = w[pivot]!;
      w[pivot] = tmp;
    }
    const prow = w[col]!;
    for (let r = col + 1; r < n; r++) {
      const factor = w[r]![col]! / pivotVal;
      if (factor === 0) continue;
      const wr = w[r]!;
      for (let c = col; c <= n; c++) wr[c] = wr[c]! - factor * prow[c]!;
    }
  }

  const x = new Array<number>(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = w[r]![n]!;
    for (let c = r + 1; c < n; c++) s -= w[r]![c]! * x[c]!;
    x[r] = s / w[r]![r]!;
  }
  return x;
}

/** Invert a small square matrix by solving against identity columns. */
export function inverse(a: readonly (readonly number[])[]): number[][] {
  const n = a.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0);
    e[j] = 1;
    cols.push(solve(a, e));
  }
  // cols[j] is the j-th column of the inverse
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]!));
}

/** OLS coefficients: solve(X'X, X'y), as seminr's inner regressions. */
export function ols(x: readonly (readonly number[])[], y: readonly number[]): number[] {
  const xt = transpose(x);
  const xtx = matmul(xt, x);
  const xty = xt.map((row) => {
    let s = 0;
    for (let i = 0; i < row.length; i++) s += row[i]! * y[i]!;
    return s;
  });
  return solve(xtx, xty);
}
