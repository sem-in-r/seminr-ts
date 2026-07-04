/**
 * Sample and model-implied covariance matrices for covariance-based SEM
 * (LISREL all-y): Sigma = Lambda (I-B)^-1 Psi (I-B)^-T Lambda^T + Theta.
 */

import type { Matrix } from "../math/matrix.ts";
import { matmul, transpose, zeros } from "../math/matrix.ts";
import { inverse } from "../math/solve.ts";
import { mean } from "../math/stats.ts";
import type { ColumnMatrix } from "../estimate/data.ts";
import type { CbsemParTable } from "./partable.ts";

/**
 * Biased (N-denominator) sample covariance over all columns of `data` —
 * lavaan's default (sample.cov.rescale=TRUE, likelihood="normal").
 */
export function sampleCovariance(data: ColumnMatrix): Matrix {
  const n = data.values.length;
  const p = data.columns.length;
  const means = Array.from({ length: p }, (_, j) => mean(data.values.map((row) => row[j]!)));
  const s = zeros(p, p);
  for (const row of data.values) {
    for (let i = 0; i < p; i++) {
      const di = row[i]! - means[i]!;
      for (let j = i; j < p; j++) {
        s[i]![j] = s[i]![j]! + di * (row[j]! - means[j]!);
      }
    }
  }
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      const v = s[i]![j]! / n;
      s[i]![j] = v;
      s[j]![i] = v;
    }
  }
  return s;
}

export interface ModelMatrices {
  /** observed x latents */
  lambda: Matrix;
  /** observed x observed (symmetric) */
  theta: Matrix;
  /** latents x latents (symmetric; diag fixed 1 under std.lv) */
  psi: Matrix;
  /** latents x latents, [target, source]; undefined for pure CFA */
  beta?: Matrix;
}

/** Materialize the LISREL matrices from the free-parameter vector. */
export function buildModelMatrices(pt: CbsemParTable, theta: readonly number[]): ModelMatrices {
  const p = pt.observed.length;
  const k = pt.latents.length;
  const lambda = zeros(p, k);
  const thetaM = zeros(p, p);
  const psi = zeros(k, k);
  const hasBeta = pt.freeParams.some((fp) => fp.matrix === "beta");
  const beta = hasBeta ? zeros(k, k) : undefined;
  for (let i = 0; i < k; i++) psi[i]![i] = 1; // std.lv: latent (residual) variances fixed

  pt.freeParams.forEach((fp, idx) => {
    const value = theta[idx]!;
    switch (fp.matrix) {
      case "lambda":
        lambda[fp.row]![fp.col] = value;
        break;
      case "beta":
        beta![fp.row]![fp.col] = value;
        break;
      case "theta":
        thetaM[fp.row]![fp.col] = value;
        thetaM[fp.col]![fp.row] = value;
        break;
      case "psi":
        psi[fp.row]![fp.col] = value;
        psi[fp.col]![fp.row] = value;
        break;
    }
  });
  return { lambda, theta: thetaM, psi, beta };
}

/** (I - B)^-1, or identity when there is no structural part. */
export function ibInverse(m: ModelMatrices): Matrix {
  const k = m.psi.length;
  if (!m.beta) {
    const identity = zeros(k, k);
    for (let i = 0; i < k; i++) identity[i]![i] = 1;
    return identity;
  }
  const ib = zeros(k, k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) ib[i]![j] = (i === j ? 1 : 0) - m.beta[i]![j]!;
  }
  return inverse(ib);
}

/** Latent covariance matrix VETA = (I-B)^-1 Psi (I-B)^-T. */
export function latentCovariance(m: ModelMatrices): Matrix {
  if (!m.beta) return m.psi;
  const e = ibInverse(m);
  return matmul(matmul(e, m.psi), transpose(e));
}

/** Model-implied covariance Sigma(theta). */
export function impliedSigma(m: ModelMatrices): Matrix {
  const veta = latentCovariance(m);
  const sigma = matmul(matmul(m.lambda, veta), transpose(m.lambda));
  const p = sigma.length;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) sigma[i]![j] = sigma[i]![j]! + m.theta[i]![j]!;
  }
  // exact symmetry (guards Cholesky)
  for (let i = 0; i < p; i++) {
    for (let j = i + 1; j < p; j++) {
      const v = (sigma[i]![j]! + sigma[j]![i]!) / 2;
      sigma[i]![j] = v;
      sigma[j]![i] = v;
    }
  }
  return sigma;
}
