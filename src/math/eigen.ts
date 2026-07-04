/** Symmetric eigendecomposition (cyclic Jacobi) and matrix powers. */

import type { Matrix } from "./matrix.ts";
import { zeros } from "./matrix.ts";

export interface EigenSym {
  /** Eigenvalues in descending order (mirrors R eigen()). */
  values: number[];
  /** Eigenvectors as columns, ordered to match `values`. */
  vectors: Matrix;
}

/**
 * Eigendecomposition of a symmetric matrix by the cyclic Jacobi method.
 * A = V diag(values) V^T with orthonormal V.
 */
export function jacobiEigenSym(m: readonly (readonly number[])[]): EigenSym {
  const n = m.length;
  const a = m.map((row) => [...row]);
  const v = zeros(n, n);
  for (let i = 0; i < n; i++) v[i]![i] = 1;

  const offNorm = () => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) s += a[i]![j]! ** 2;
    }
    return Math.sqrt(2 * s);
  };
  let scale = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(a[i]![j]!));
  }
  const tol = (scale || 1) * 1e-15 * n;

  for (let sweep = 0; sweep < 100 && offNorm() > tol; sweep++) {
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) <= tol / (n * n)) continue;
        const app = a[p]![p]!;
        const aqq = a[q]![q]!;
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        // Rotate rows/cols p and q of a.
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        // Accumulate rotations into v.
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[y]![y]! - a[x]![x]!);
  const values = order.map((i) => a[i]![i]!);
  const vectors = zeros(n, n);
  for (let j = 0; j < n; j++) {
    const src = order[j]!;
    for (let i = 0; i < n; i++) vectors[i]![j] = v[i]![src]!;
  }
  return { values, vectors };
}

/**
 * Symmetric matrix power via eigendecomposition: V diag(values^power) V^T
 * (seminr's `%^%` in compute_ten_berge.R).
 */
export function symMatrixPower(m: readonly (readonly number[])[], power: number): Matrix {
  const n = m.length;
  const { values, vectors } = jacobiEigenSym(m);
  const powered = values.map((x) => x ** power);
  const out = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += vectors[i]![k]! * powered[k]! * vectors[j]![k]!;
      out[i]![j] = s;
      out[j]![i] = s;
    }
  }
  return out;
}
