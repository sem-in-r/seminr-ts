/** Cholesky factorization and derived operations for symmetric PD matrices. */

import type { Matrix } from "./matrix.ts";
import { zeros } from "./matrix.ts";

/**
 * Lower-triangular Cholesky factor L with A = L L^T.
 * Throws if A is not (numerically) positive definite.
 */
export function cholesky(a: readonly (readonly number[])[]): Matrix {
  const n = a.length;
  const l = zeros(n, n);
  for (let j = 0; j < n; j++) {
    let d = a[j]![j]!;
    for (let k = 0; k < j; k++) d -= l[j]![k]! ** 2;
    if (d <= 0 || !Number.isFinite(d)) {
      throw new Error(`cholesky: matrix is not positive definite (pivot ${d} at ${j})`);
    }
    const ljj = Math.sqrt(d);
    l[j]![j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= l[i]![k]! * l[j]![k]!;
      l[i]![j] = s / ljj;
    }
  }
  return l;
}

/** log|A| from the lower Cholesky factor of A: 2 * sum(log diag(L)). */
export function logDetFromChol(l: readonly (readonly number[])[]): number {
  let s = 0;
  for (let i = 0; i < l.length; i++) s += Math.log(l[i]![i]!);
  return 2 * s;
}

/**
 * Inverse of a symmetric PD matrix via its Cholesky factor (R's chol2inv(chol(A))).
 */
export function cholInverse(a: readonly (readonly number[])[]): Matrix {
  const n = a.length;
  const l = cholesky(a);
  // Solve L Y = I column by column (forward), then L^T X = Y (backward).
  const inv = zeros(n, n);
  const y = new Array<number>(n);
  for (let c = 0; c < n; c++) {
    for (let i = 0; i < n; i++) {
      let s = i === c ? 1 : 0;
      for (let k = 0; k < i; k++) s -= l[i]![k]! * y[k]!;
      y[i] = s / l[i]![i]!;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i]!;
      for (let k = i + 1; k < n; k++) s -= l[k]![i]! * inv[k]![c]!;
      inv[i]![c] = s / l[i]![i]!;
    }
  }
  // Symmetrize to remove round-off drift.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = (inv[i]![j]! + inv[j]![i]!) / 2;
      inv[i]![j] = v;
      inv[j]![i] = v;
    }
  }
  return inv;
}
