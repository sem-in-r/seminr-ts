/**
 * Standard errors (lavaan se="standard": expected information), z/p/CI
 * columns, and the parameterEstimates / standardizedSolution tables.
 */

import { matmul, transpose, zeros, type Matrix } from "../math/matrix.ts";
import { cholInverse } from "../math/cholesky.ts";
import { inverse } from "../math/solve.ts";
import { normalCdf } from "../math/distributions.ts";
import type { CbsemParTable, ParamOp } from "./partable.ts";
import {
  buildModelMatrices,
  ibInverse,
  impliedSigma,
  latentCovariance,
  type ModelMatrices,
} from "./sigma.ts";
import { standardizedSolution } from "./standardize.ts";
import type { MlFitResult } from "./mlFit.ts";

const Z975 = 1.959963984540054; // qnorm(0.975)

/** vech (column-major lower triangle incl. diagonal) of a symmetric matrix. */
function vech(m: Matrix): number[] {
  const p = m.length;
  const out: number[] = [];
  for (let j = 0; j < p; j++) {
    for (let i = j; i < p; i++) out.push(m[i]![j]!);
  }
  return out;
}

/** dSigma/dtheta_k as full p x p matrices, one per free parameter. */
function sigmaDerivatives(pt: CbsemParTable, m: ModelMatrices): Matrix[] {
  const p = pt.observed.length;
  const k = pt.latents.length;
  const e = ibInverse(m);
  const veta = latentCovariance(m); // E Psi E'
  const lambdaE = matmul(m.lambda, e); // p x k
  const lambdaVeta = matmul(m.lambda, veta); // p x k  (Lambda E Psi E')
  const psiEt = matmul(m.psi, transpose(e)); // k x k
  const ePsiEtLambdaT = transpose(lambdaVeta); // k x p = E Psi E' Lambda'

  return pt.freeParams.map((fp) => {
    const d = zeros(p, p);
    switch (fp.matrix) {
      case "lambda": {
        // dSigma = J Veta Lambda' + Lambda Veta J'
        const i = fp.row;
        for (let c = 0; c < p; c++) {
          const v = lambdaVeta[c]![fp.col]!;
          d[i]![c] = d[i]![c]! + v;
          d[c]![i] = d[c]![i]! + v;
        }
        break;
      }
      case "theta": {
        d[fp.row]![fp.col] = 1;
        d[fp.col]![fp.row] = 1;
        break;
      }
      case "psi": {
        // dSigma = Lambda E (J + J') E' Lambda'
        const le1 = lambdaE.map((row) => row[fp.row]!); // column fp.row of Lambda E
        const le2 = lambdaE.map((row) => row[fp.col]!);
        for (let a = 0; a < p; a++) {
          for (let b = 0; b < p; b++) {
            let v = le1[a]! * le2[b]! + le2[a]! * le1[b]!;
            if (fp.row === fp.col) v /= 2;
            d[a]![b] = d[a]![b]! + v;
          }
        }
        break;
      }
      case "beta": {
        // dSigma = Lambda E J (E Psi E' Lambda')  + transpose
        const le = lambdaE.map((row) => row[fp.row]!); // col fp.row of Lambda E
        const right = ePsiEtLambdaT[fp.col]!; // row fp.col of E Psi E' Lambda'
        void psiEt;
        for (let a = 0; a < p; a++) {
          for (let b = 0; b < p; b++) {
            const v = le[a]! * right[b]!;
            d[a]![b] = d[a]![b]! + v;
            d[b]![a] = d[b]![a]! + v;
          }
        }
        break;
      }
    }
    return d;
  });
}

/** Jacobian of vech(Sigma) w.r.t. the free parameters (pstar x npar). */
export function deltaMatrix(pt: CbsemParTable, m: ModelMatrices): Matrix {
  const derivs = sigmaDerivatives(pt, m);
  const cols = derivs.map((d) => vech(d));
  const pstar = cols[0]?.length ?? 0;
  const out = zeros(pstar, derivs.length);
  for (let c = 0; c < derivs.length; c++) {
    for (let r = 0; r < pstar; r++) out[r]![c] = cols[c]![r]!;
  }
  return out;
}

export interface StandardErrorsResult {
  /** Parameter covariance matrix (npar x npar). */
  vcov: Matrix;
  /** Standard errors in free-parameter order. */
  se: number[];
}

/**
 * Expected-information standard errors: I_kl = 0.5 tr(Sigma^-1 dSigma_k
 * Sigma^-1 dSigma_l); VCOV = I^-1 / N.
 */
export function mlStandardErrors(
  pt: CbsemParTable,
  m: ModelMatrices,
  n: number,
): StandardErrorsResult {
  const sigmaInv = cholInverse(impliedSigma(m));
  const derivs = sigmaDerivatives(pt, m);
  const npar = derivs.length;
  const p = sigmaInv.length;
  // G_k = Sigma^-1 dSigma_k Sigma^-1
  const gs = derivs.map((d) => matmul(matmul(sigmaInv, d), sigmaInv));
  const info = zeros(npar, npar);
  for (let a = 0; a < npar; a++) {
    for (let b = a; b < npar; b++) {
      let s = 0;
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) s += gs[a]![i]![j]! * derivs[b]![i]![j]!;
      }
      info[a]![b] = 0.5 * s;
      info[b]![a] = 0.5 * s;
    }
  }
  const vcov = inverse(info).map((row) => row.map((v) => v / n));
  const se = vcov.map((row, i) => Math.sqrt(Math.max(row[i]!, 0)));
  return { vcov, se };
}

export interface SolutionRow {
  lhs: string;
  op: ParamOp;
  rhs: string;
  est: number;
  se: number;
  z: number | null;
  pvalue: number | null;
  ciLower: number | null;
  ciUpper: number | null;
}

const twoSidedP = (z: number) => 2 * (1 - normalCdf(Math.abs(z)));

function tableFromEstimates(
  pt: CbsemParTable,
  estimateOf: (rowIndex: number) => number,
  seOf: (rowIndex: number) => number,
): SolutionRow[] {
  return pt.rows.map((row, i) => {
    const est = estimateOf(i);
    const se = seOf(i);
    const hasSe = se > 0;
    return {
      lhs: row.lhs,
      op: row.op,
      rhs: row.rhs,
      est,
      se,
      z: hasSe ? est / se : null,
      pvalue: hasSe ? twoSidedP(est / se) : null,
      ciLower: est - Z975 * se,
      ciUpper: est + Z975 * se,
    };
  });
}

/** Value of parameter-table row i inside the (possibly standardized) matrices. */
function rowValue(
  pt: CbsemParTable,
  i: number,
  matrices: { lambda: Matrix; theta: Matrix; psi: Matrix; beta?: Matrix },
): number {
  const row = pt.rows[i]!;
  const freeIdx = row.free;
  if (freeIdx > 0) {
    const fp = pt.freeParams[freeIdx - 1]!;
    const m = matrices[fp.matrix];
    return m ? m[fp.row]![fp.col]! : Number.NaN;
  }
  // Fixed rows: single-item theta (0) or psi diagonal (1 unstandardized).
  const latentIdx = pt.latents.indexOf(row.lhs);
  if (row.op === "~~" && latentIdx !== -1) {
    return matrices.psi[latentIdx]![latentIdx]!;
  }
  const obsIdx = pt.observed.indexOf(row.lhs);
  return matrices.theta[obsIdx]![obsIdx]!;
}

/**
 * Unstandardized estimates with SEs, z, p, and 95% CIs (lavaan
 * parameterEstimates). Pass `seOverride` (e.g. robust sandwich SEs) to swap
 * the expected-information SEs out.
 */
export function parameterEstimatesTable(
  pt: CbsemParTable,
  fit: MlFitResult,
  n: number,
  seOverride?: readonly number[],
): SolutionRow[] {
  const se = seOverride ?? mlStandardErrors(pt, fit.matrices, n).se;
  return tableFromEstimates(
    pt,
    (i) => rowValue(pt, i, fit.matrices),
    (i) => {
      const freeIdx = pt.rows[i]!.free;
      return freeIdx > 0 ? se[freeIdx - 1]! : 0;
    },
  );
}

export interface StandardizedRow extends SolutionRow {
  estStd: number;
}

/**
 * Completely standardized solution with delta-method SEs: J VCOV J' where J
 * is the numeric Jacobian of the std.all transform w.r.t. the free parameters
 * (lavaan standardizedSolution).
 */
export function standardizedSolutionTable(
  pt: CbsemParTable,
  fit: MlFitResult,
  n: number,
  vcovOverride?: Matrix,
): StandardizedRow[] {
  const vcov = vcovOverride ?? mlStandardErrors(pt, fit.matrices, n).vcov;
  const nRows = pt.rows.length;

  const stdVector = (theta: readonly number[]): number[] => {
    const m = buildModelMatrices(pt, theta);
    const std = standardizedSolution(pt, m);
    return Array.from({ length: nRows }, (_, i) => rowValue(pt, i, std));
  };

  const base = stdVector(fit.theta);
  const npar = fit.theta.length;
  const h = 1e-6;
  // Jacobian: nRows x npar
  const jac = zeros(nRows, npar);
  for (let k = 0; k < npar; k++) {
    const up = [...fit.theta];
    const dn = [...fit.theta];
    up[k] = up[k]! + h;
    dn[k] = dn[k]! - h;
    const vUp = stdVector(up);
    const vDn = stdVector(dn);
    for (let r = 0; r < nRows; r++) jac[r]![k] = (vUp[r]! - vDn[r]!) / (2 * h);
  }
  const jv = matmul(jac, vcov);
  const seStd = Array.from({ length: nRows }, (_, r) => {
    let s = 0;
    for (let k = 0; k < npar; k++) s += jv[r]![k]! * jac[r]![k]!;
    return Math.sqrt(Math.max(s, 0));
  });

  return pt.rows.map((row, i) => {
    const est = base[i]!;
    const se = seStd[i]!;
    const hasSe = se > 0;
    return {
      lhs: row.lhs,
      op: row.op,
      rhs: row.rhs,
      est,
      estStd: est,
      se,
      z: hasSe ? est / se : null,
      pvalue: hasSe ? twoSidedP(est / se) : null,
      ciLower: est - Z975 * se,
      ciUpper: est + Z975 * se,
    };
  });
}
