/**
 * Ten Berge et al. (1999) correlation-preserving factor scores, mirroring
 * seminr's calc_ten_berge_scores (compute_ten_berge.R) with inputs from the
 * fitted model: std.lv loadings, latent correlations, and the raw item data.
 */

import { matmul, namedMatrix, transpose, type NamedMatrix } from "../math/matrix.ts";
import { cholInverse } from "../math/cholesky.ts";
import { symMatrixPower } from "../math/eigen.ts";
import { mean } from "../math/stats.ts";
import type { ColumnMatrix } from "../estimate/data.ts";
import type { CbsemParTable } from "./partable.ts";
import type { ModelMatrices } from "./sigma.ts";
import type { StandardizedSolution } from "./standardize.ts";

export interface TenBergeResult {
  /** n x latents factor scores. */
  scores: ColumnMatrix;
  /** observed x latents score weights W. */
  weights: NamedMatrix;
}

export function tenBergeScores(
  pt: CbsemParTable,
  m: ModelMatrices,
  std: StandardizedSolution,
  data: ColumnMatrix,
): TenBergeResult {
  const n = data.values.length;
  const p = pt.observed.length;

  // Standardize items with mean and N-denominator SD (lavaan sampstat cov diag).
  const means = Array.from({ length: p }, (_, j) => mean(data.values.map((row) => row[j]!)));
  const sds = Array.from({ length: p }, (_, j) => {
    let ss = 0;
    for (const row of data.values) ss += (row[j]! - means[j]!) ** 2;
    return Math.sqrt(ss / n);
  });
  const x = data.values.map((row) => row.map((v, j) => (v - means[j]!) / sds[j]!));

  // Item correlation matrix: x is z-scored with N-denominator SDs, so
  // cor = X'X / n exactly.
  const r = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => {
      let s = 0;
      for (const row of x) s += row[i]! * row[j]!;
      return s / n;
    }),
  );

  // std.lv loadings: lambda * latent SD (latents standardized, observed not).
  const lambdaStdLv = m.lambda.map((row) => row.map((v, j) => v * std.latentSd[j]!));
  const phi = std.corLv;

  const rSqrtInv = symMatrixPower(r, -0.5);
  const phiSqrt = symMatrixPower(phi, 0.5);
  const l = matmul(lambdaStdLv, phiSqrt);
  const rInv = cholInverse(r);
  const inner = symMatrixPower(matmul(matmul(transpose(l), rInv), l), -0.5);
  const c = matmul(matmul(rSqrtInv, l), inner);
  const w = matmul(matmul(rSqrtInv, c), phiSqrt);

  const scores = x.map((row) =>
    Array.from({ length: pt.latents.length }, (_, j) => {
      let s = 0;
      for (let i = 0; i < p; i++) s += row[i]! * w[i]![j]!;
      return s;
    }),
  );

  return {
    scores: { columns: [...pt.latents], values: scores },
    weights: namedMatrix([...pt.observed], [...pt.latents], w),
  };
}
