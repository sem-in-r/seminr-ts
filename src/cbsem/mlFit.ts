/**
 * Maximum-likelihood discrepancy function, analytic gradient, and fitting for
 * covariance-based SEM. Minimizes 0.5*F with
 * F = log|Sigma| + tr(S Sigma^-1) - log|S| - p (lavaan's objective under
 * estimator ML, likelihood "normal").
 */

import { matmul, transpose, type Matrix } from "../math/matrix.ts";
import { cholesky, logDetFromChol, cholInverse } from "../math/cholesky.ts";
import { bfgs } from "../math/optimize.ts";
import type { CbsemParTable } from "./partable.ts";
import {
  buildModelMatrices,
  ibInverse,
  impliedSigma,
  latentCovariance,
  type ModelMatrices,
} from "./sigma.ts";

/** 0.5*F_ML at the given free-parameter vector; +Infinity when Sigma is not PD. */
export function mlObjective(pt: CbsemParTable, s: Matrix, theta: readonly number[]): number {
  const sigma = impliedSigma(buildModelMatrices(pt, theta));
  let cholSigma: Matrix;
  try {
    cholSigma = cholesky(sigma);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  const logDetSigma = logDetFromChol(cholSigma);
  const logDetS = logDetFromChol(cholesky(s));
  const sigmaInv = cholInverse(sigma);
  const p = s.length;
  let trace = 0;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) trace += s[i]![j]! * sigmaInv[j]![i]!;
  }
  return 0.5 * (logDetSigma + trace - logDetS - p);
}

/** Analytic gradient of {@link mlObjective} w.r.t. the free parameters. */
export function mlGradient(pt: CbsemParTable, s: Matrix, theta: readonly number[]): number[] {
  const m = buildModelMatrices(pt, theta);
  const sigma = impliedSigma(m);
  const sigmaInv = cholInverse(sigma);
  const p = s.length;

  // G = d(0.5F)/dSigma = 0.5 * Sigma^-1 (Sigma - S) Sigma^-1  (symmetric)
  const diff = sigma.map((row, i) => row.map((v, j) => v - s[i]![j]!));
  const g = matmul(matmul(sigmaInv, diff), sigmaInv).map((row) => row.map((v) => 0.5 * v));

  const e = ibInverse(m);
  const veta = latentCovariance(m); // E Psi E^T
  const gLambdaVeta = matmul(matmul(g, m.lambda), veta); // p x k
  const lambdaE = matmul(m.lambda, e); // p x k
  const t = matmul(matmul(transpose(lambdaE), g), lambdaE); // k x k: E' L' G L E
  const gradBetaFull = m.beta
    ? matmul(matmul(t, m.psi), transpose(e)).map((row) => row.map((v) => 2 * v))
    : undefined;

  return pt.freeParams.map((fp, idx) => {
    void idx;
    switch (fp.matrix) {
      case "lambda":
        return 2 * gLambdaVeta[fp.row]![fp.col]!;
      case "beta":
        return gradBetaFull![fp.row]![fp.col]!;
      case "psi":
        return fp.row === fp.col ? t[fp.row]![fp.col]! : 2 * t[fp.row]![fp.col]!;
      case "theta":
        return fp.row === fp.col ? g[fp.row]![fp.col]! : 2 * g[fp.row]![fp.col]!;
    }
  });
}

/**
 * Deterministic starting values: loadings 1, regressions/covariances 0,
 * residual item variances 0.5*diag(S) (lavaan's simple default; fabin3 not
 * needed for convergence to the same optimum).
 */
export function startingValues(pt: CbsemParTable, s: Matrix): number[] {
  return pt.freeParams.map((fp) => {
    if (fp.matrix === "lambda") return 1;
    if (fp.matrix === "beta" && fp.op === "=~") return 1;
    if (fp.matrix === "theta" && fp.row === fp.col) return 0.5 * s[fp.row]![fp.row]!;
    return 0;
  });
}

export interface FitMlOptions {
  maxIter?: number;
  gradTol?: number;
  start?: readonly number[];
}

export interface MlFitResult {
  /** Free parameters in lavaan free-index order (sign-normalized). */
  theta: number[];
  matrices: ModelMatrices;
  /** 0.5*F at the optimum (lavaan fmin). */
  objective: number;
  iterations: number;
  converged: boolean;
}

/** Flip factors so each latent's first measurement loading is positive (lavaan convention). */
function signNormalize(pt: CbsemParTable, m: ModelMatrices): void {
  const k = pt.latents.length;
  for (let j = 0; j < k; j++) {
    const latent = pt.latents[j]!;
    const first = pt.freeParams.find((fp) => fp.op === "=~" && fp.lhs === latent);
    if (!first) continue;
    const value = first.matrix === "lambda" ? m.lambda[first.row]![j]! : m.beta![first.row]![j]!;
    if (value >= 0) continue;
    for (let i = 0; i < m.lambda.length; i++) m.lambda[i]![j] = -m.lambda[i]![j]!;
    for (let i = 0; i < k; i++) {
      m.psi[i]![j] = -m.psi[i]![j]!;
      m.psi[j]![i] = -m.psi[j]![i]!;
      if (m.beta) {
        m.beta[i]![j] = -m.beta[i]![j]!;
        m.beta[j]![i] = -m.beta[j]![i]!;
      }
    }
  }
}

/** Read the free-parameter vector back out of (possibly sign-flipped) matrices. */
function extractTheta(pt: CbsemParTable, m: ModelMatrices): number[] {
  return pt.freeParams.map((fp) => {
    switch (fp.matrix) {
      case "lambda":
        return m.lambda[fp.row]![fp.col]!;
      case "beta":
        return m.beta![fp.row]![fp.col]!;
      case "psi":
        return m.psi[fp.row]![fp.col]!;
      case "theta":
        return m.theta[fp.row]![fp.col]!;
    }
  });
}

/** Fit the model by ML from a cold start; returns sign-normalized estimates. */
export function fitMl(pt: CbsemParTable, s: Matrix, options: FitMlOptions = {}): MlFitResult {
  const x0 = options.start ? [...options.start] : startingValues(pt, s);
  const result = bfgs({
    fn: (t) => mlObjective(pt, s, t),
    grad: (t) => mlGradient(pt, s, t),
    x0,
    maxIter: options.maxIter ?? 10000,
    // Push to the double-precision floor (the stall exit fires when objective
    // decrease dies, typically at gradient ~1e-8 — within ~5e-6 of the exact
    // optimum even along flat ridges).
    gradTol: options.gradTol ?? 1e-9,
    stallGradTol: 1e-6,
  });
  const matrices = buildModelMatrices(pt, result.x);
  signNormalize(pt, matrices);
  return {
    theta: extractTheta(pt, matrices),
    matrices,
    objective: result.fx,
    iterations: result.iterations,
    converged: result.converged,
  };
}
