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
 *
 * **Eigenvalues at the zero threshold are treated as exactly zero, and a
 * negative power maps them to zero rather than to infinity or NaN.** That is
 * the Moore-Penrose convention, and it is a deliberate departure from seminr's
 * `%^%`, which has no such guard. The reason is a real model rather than a
 * hypothetical: in the C5 higher-order CBSEM fit, `ImageSat` is a second-order
 * factor over exactly `Image` and `Satisfaction`, so the five latent loading
 * columns of `L' R^-1 L` in `src/cbsem/tenBerge.ts` span four dimensions and
 * its smallest eigenvalue is a rounding artefact — measured at +1.2e-16 against
 * a largest of 4.63. Its *sign* is luck, and three separate perturbations
 * flipped it during plan 010: delegating the optimizer, delegating the
 * Cholesky, and the FMA setting inside it. `(-1.2e-16) ** -0.5` is NaN, so the
 * whole factor-score matrix became NaN on a rounding bit.
 *
 * Dropping the direction instead costs nothing measurable. The contribution of
 * that eigenvector to the ten Berge weights is `||L v|| * lambda^-0.5` =
 * 1.05e-15 * 9.1e7 = **9.5e-8**, against O(1) from the four real directions and
 * a fixture tolerance of 5e-5. So the number this guard removes was noise
 * amplified by 1e8, and R's answer sits within 5e-5 of ours either way.
 *
 * The threshold is the standard rank tolerance, `n * eps * max|lambda|`. An
 * eigenvalue that is genuinely negative — beyond the threshold — is left alone,
 * so indefiniteness stays visible as a NaN instead of being quietly absorbed.
 */
export function symMatrixPower(m: readonly (readonly number[])[], power: number): Matrix {
  const n = m.length;
  const { values, vectors } = jacobiEigenSym(m);
  const largest = values.reduce((mx, x) => Math.max(mx, Math.abs(x)), 0);
  const zeroTol = n * Number.EPSILON * largest;
  const powered = values.map((x) => (Math.abs(x) <= zeroTol ? 0 : x ** power));
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
