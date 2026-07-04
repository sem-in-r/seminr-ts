/**
 * MLR robust layer, replicating lavaan 0.6-21 under estimator "MLR" for
 * continuous complete data, single group, no meanstructure:
 * se = "robust.huber.white" (sandwich), test = "yuan.bentler.mplus".
 *
 * Provenance (digested in PLAN.cbsem-robust.md F1):
 * - observed information = numeric Hessian of the analytic gradient
 *   (lav_model_hessian.R:3-129: 4-point central difference, h = 1e-6,
 *   symmetrized)
 * - meat B0 = Delta' (SC'SC/N) Delta with structured casewise scores
 *   (lav_model_information.R:410-476, lav_mvnorm.R:567-616,875-920)
 * - sandwich VCOV = E.inv B0 E.inv / N (lav_model_vcov.R:218-293,589)
 * - Yuan-Bentler-Mplus trace: trace.h1 = tr(A1(S) Gamma),
 *   trace.h0 = tr(B0 E.inv); scaling factor c = (trace.h1 - trace.h0)/df
 *   (lav_test_yuan_bentler.R:374-430, lav_mvnorm_h1.R:375-454)
 * - Gamma = Zc'Zc/N over Z_i = vech(yc_i yc_i') (lav_samplestats_gamma.R:420-520)
 * - baseline (independence) model gets the identical treatment; its observed
 *   information is diagonal 0.5/s_jj^2, so E.inv_b = diag(2 s_jj^2)
 */

import { matmul, transpose, zeros, type Matrix } from "../math/matrix.ts";
import { cholInverse } from "../math/cholesky.ts";
import { inverse } from "../math/solve.ts";
import type { Dataset } from "../estimate/data.ts";
import type { CbsemParTable } from "./partable.ts";
import { impliedSigma } from "./sigma.ts";
import { mlGradient, type MlFitResult } from "./mlFit.ts";
import { deltaMatrix } from "./standardErrors.ts";

/** Everything the MLR summary needs beyond the ML fit. */
export interface RobustLayer {
  /** Sandwich parameter covariance matrix (npar x npar, already / N). */
  vcov: Matrix;
  /** Robust standard errors in free-parameter order. */
  se: number[];
  /** tr(A1(S) Gamma) — saturated-model trace (model-independent). */
  traceH1: number;
  /** tr(B0 E.inv) for the fitted model. */
  traceH0: number;
  /** trace of U Gamma = traceH1 - traceH0. */
  traceUGamma: number;
  /** Yuan-Bentler-Mplus scaling factor c = traceUGamma / df (NaN if <= 0). */
  scalingFactor: number;
  /** Scaling factor of the baseline (independence) model. */
  baselineScalingFactor: number;
  /** scaling.factor.h1 = traceH1 / (p*(p+1)/2). */
  scalingFactorH1: number;
  /** scaling.factor.h0 = traceH0 / npar. */
  scalingFactorH0: number;
}

/** Column-major lower-triangle (i >= j) index pairs, lavaan's vech order. */
function vechPairs(p: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let j = 0; j < p; j++) {
    for (let i = j; i < p; i++) pairs.push([i, j]);
  }
  return pairs;
}

/**
 * Observed information: numeric Hessian of the analytic gradient of the unit
 * objective 0.5*F, replicating lavaan's scheme exactly (4-point central
 * difference with absolute step h = 1e-6, then symmetrized).
 */
export function observedInformation(
  pt: CbsemParTable,
  s: Matrix,
  theta: readonly number[],
): Matrix {
  const npar = theta.length;
  const h = 1e-6;
  const hessian = zeros(npar, npar);
  for (let j = 0; j < npar; j++) {
    const at = (offset: number): number[] => {
      const x = [...theta];
      x[j] = x[j]! + offset;
      return mlGradient(pt, s, x);
    };
    const gl2 = at(-2 * h);
    const gl = at(-h);
    const gr = at(h);
    const gr2 = at(2 * h);
    for (let i = 0; i < npar; i++) {
      hessian[i]![j] = (gl2[i]! - 8 * gl[i]! + 8 * gr[i]! - gr2[i]!) / (12 * h);
    }
  }
  for (let i = 0; i < npar; i++) {
    for (let j = i + 1; j < npar; j++) {
      const v = (hessian[i]![j]! + hessian[j]![i]!) / 2;
      hessian[i]![j] = v;
      hessian[j]![i] = v;
    }
  }
  return hessian;
}

/** Column means of a dataset. */
function columnMeans(data: Dataset): number[] {
  const n = data.values.length;
  const p = data.columns.length;
  const means = new Array<number>(p).fill(0);
  for (const row of data.values) {
    for (let j = 0; j < p; j++) means[j]! += row[j]!;
  }
  return means.map((m) => m / n);
}

/**
 * Casewise scores w.r.t. vech(Sigma) at the (structured) model-implied Sigma
 * (lav_mvnorm_scores_vech_sigma): W = Yc Sigma^-1;
 * SC[.,(i,j)] = W[.,i] W[.,j] - Sigma^-1[i][j], diagonal positions halved.
 */
function casewiseScores(data: Dataset, sigmaInv: Matrix, means: number[]): Matrix {
  const n = data.values.length;
  const p = data.columns.length;
  const pairs = vechPairs(p);
  const sc = zeros(n, pairs.length);
  const w = new Array<number>(p);
  for (let r = 0; r < n; r++) {
    const row = data.values[r]!;
    for (let i = 0; i < p; i++) {
      let acc = 0;
      for (let k = 0; k < p; k++) acc += (row[k]! - means[k]!) * sigmaInv[k]![i]!;
      w[i] = acc;
    }
    for (let a = 0; a < pairs.length; a++) {
      const [i, j] = pairs[a]!;
      let v = w[i]! * w[j]! - sigmaInv[i]![j]!;
      if (i === j) v /= 2;
      sc[r]![a] = v;
    }
  }
  return sc;
}

/**
 * ADF fourth-moment matrix Gamma = Zc'Zc/N with Z_i = vech(yc_i yc_i'),
 * Zc column-centered (denominator N; gamma.n.minus.one = FALSE).
 */
export function gammaMatrix(data: Dataset): Matrix {
  const n = data.values.length;
  const p = data.columns.length;
  const means = columnMeans(data);
  const pairs = vechPairs(p);
  const z = zeros(n, pairs.length);
  for (let r = 0; r < n; r++) {
    const row = data.values[r]!;
    for (let a = 0; a < pairs.length; a++) {
      const [i, j] = pairs[a]!;
      z[r]![a] = (row[i]! - means[i]!) * (row[j]! - means[j]!);
    }
  }
  const colMeans = new Array<number>(pairs.length).fill(0);
  for (const row of z) {
    for (let a = 0; a < pairs.length; a++) colMeans[a]! += row[a]!;
  }
  for (let a = 0; a < pairs.length; a++) colMeans[a]! /= n;
  const gamma = zeros(pairs.length, pairs.length);
  for (let r = 0; r < n; r++) {
    const row = z[r]!;
    for (let a = 0; a < pairs.length; a++) {
      const za = row[a]! - colMeans[a]!;
      for (let b = a; b < pairs.length; b++) {
        gamma[a]![b] = gamma[a]![b]! + za * (row[b]! - colMeans[b]!);
      }
    }
  }
  for (let a = 0; a < pairs.length; a++) {
    for (let b = a; b < pairs.length; b++) {
      const v = gamma[a]![b]! / n;
      gamma[a]![b] = v;
      gamma[b]![a] = v;
    }
  }
  return gamma;
}

/**
 * Expected h1 information in vech space: 0.5 D'(Ainv ⊗ Ainv)D for a symmetric
 * inverse covariance Ainv (D = duplication matrix).
 */
export function a1Matrix(aInv: Matrix): Matrix {
  const p = aInv.length;
  const pairs = vechPairs(p);
  const out = zeros(pairs.length, pairs.length);
  for (let a = 0; a < pairs.length; a++) {
    const [i, j] = pairs[a]!;
    const dupA: Array<[number, number]> = i === j ? [[i, j]] : [[i, j], [j, i]];
    for (let b = a; b < pairs.length; b++) {
      const [k, l] = pairs[b]!;
      const dupB: Array<[number, number]> = k === l ? [[k, l]] : [[k, l], [l, k]];
      let sum = 0;
      for (const [r, sIdx] of dupA) {
        for (const [t, u] of dupB) sum += aInv[r]![t]! * aInv[sIdx]![u]!;
      }
      const v = 0.5 * sum;
      out[a]![b] = v;
      out[b]![a] = v;
    }
  }
  return out;
}

const traceProduct = (a: Matrix, b: Matrix): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a.length; j++) sum += a[i]![j]! * b[j]![i]!;
  }
  return sum;
};

/**
 * Full MLR robust layer for a fitted model: sandwich VCOV/SEs plus the
 * Yuan-Bentler-Mplus scaling factors for the model and baseline.
 */
export function robustLayer(
  pt: CbsemParTable,
  fit: MlFitResult,
  s: Matrix,
  data: Dataset,
): RobustLayer {
  const n = data.values.length;
  const p = s.length;
  const pstar = (p * (p + 1)) / 2;
  const npar = fit.theta.length;
  const df = pstar - npar;
  const means = columnMeans(data);

  // Bread: inverse observed information.
  const eInv = inverse(observedInformation(pt, s, fit.theta));

  // Meat: B0 = Delta' (SC'SC/N) Delta, computed as (SC Delta)'(SC Delta)/N.
  const sigmaInv = cholInverse(impliedSigma(fit.matrices));
  const sc = casewiseScores(data, sigmaInv, means);
  const delta = deltaMatrix(pt, fit.matrices);
  const scTheta = matmul(sc, delta); // n x npar
  const b0 = matmul(transpose(scTheta), scTheta).map((row) => row.map((v) => v / n));

  const nVarCov = matmul(matmul(eInv, b0), eInv);
  const vcov = nVarCov.map((row) => row.map((v) => v / n));
  const se = vcov.map((row, i) => Math.sqrt(Math.max(row[i]!, 0)));

  // Yuan-Bentler-Mplus traces (h1 side is model-independent).
  const gamma = gammaMatrix(data);
  const a1 = a1Matrix(cholInverse(s));
  const traceH1 = traceProduct(a1, gamma);
  const traceH0 = traceProduct(b0, eInv);
  const traceUGamma = traceH1 - traceH0;
  const scalingFactor = traceUGamma > 0 ? traceUGamma / df : Number.NaN;

  // Baseline (independence) model: theta_b = diag(S); scores are the vech
  // diagonal columns at Sigma_b = diag(S); observed info = diag(0.5/s_jj^2).
  const scB = zeros(n, p);
  for (let r = 0; r < n; r++) {
    const row = data.values[r]!;
    for (let j = 0; j < p; j++) {
      const sjj = s[j]![j]!;
      const w = (row[j]! - means[j]!) / sjj;
      scB[r]![j] = 0.5 * (w * w - 1 / sjj);
    }
  }
  let traceH0B = 0;
  for (let j = 0; j < p; j++) {
    let b0jj = 0;
    for (let r = 0; r < n; r++) b0jj += scB[r]![j]! * scB[r]![j]!;
    b0jj /= n;
    traceH0B += b0jj * 2 * s[j]![j]! * s[j]![j]!;
  }
  const dfB = pstar - p;
  const traceUGammaB = traceH1 - traceH0B;
  const baselineScalingFactor = traceUGammaB > 0 ? traceUGammaB / dfB : Number.NaN;

  return {
    vcov,
    se,
    traceH1,
    traceH0,
    traceUGamma,
    scalingFactor,
    baselineScalingFactor,
    scalingFactorH1: traceH1 / pstar,
    scalingFactorH0: traceH0 / npar,
  };
}
