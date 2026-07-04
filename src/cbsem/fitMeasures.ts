/**
 * Standard (unscaled ML) fit measures matching lavaan's fitMeasures() under
 * estimator ML, single group, complete data, no meanstructure.
 */

import type { Matrix } from "../math/matrix.ts";
import { cholesky, logDetFromChol, cholInverse } from "../math/cholesky.ts";
import { chisqCdf, noncentralChisqCdf } from "../math/distributions.ts";
import type { CbsemParTable } from "./partable.ts";
import { impliedSigma } from "./sigma.ts";
import type { MlFitResult } from "./mlFit.ts";

/** Root of f on [lo, hi] by bisection (f(lo), f(hi) must bracket). */
function bisect(f: (x: number) => number, lo: number, hi: number, tol = 1e-9): number {
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (Math.abs(hi - lo) < tol * Math.max(1, Math.abs(mid))) return mid;
    if ((flo < 0 && fmid < 0) || (flo > 0 && fmid > 0)) {
      lo = mid;
      flo = fmid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** 90% RMSEA confidence bounds via noncentral chi-square inversion (lavaan). */
function rmseaCi(x2: number, df: number, n: number): { lower: number; upper: number } {
  const upperPerc = 0.95;
  const lowerPerc = 0.05;
  const lowerLambda = (l: number) => noncentralChisqCdf(x2, df, l) - upperPerc;
  const upperLambda = (l: number) => noncentralChisqCdf(x2, df, l) - lowerPerc;

  let lower = 0;
  if (df >= 1 && lowerLambda(0) >= 0) {
    lower = Math.sqrt(bisect(lowerLambda, 0, x2) / (n * df));
  }
  let upper = 0;
  const nRmsea = Math.max(n, x2 * 4);
  if (df >= 1 && upperLambda(nRmsea) <= 0 && upperLambda(0) >= 0) {
    upper = Math.sqrt(bisect(upperLambda, 0, nRmsea) / (n * df));
  }
  return { lower, upper };
}

export function fitMeasures(
  pt: CbsemParTable,
  s: Matrix,
  fit: MlFitResult,
  n: number,
): Record<string, number> {
  const p = s.length;
  const pstar = (p * (p + 1)) / 2;
  const npar = pt.freeParams.length;
  const df = pstar - npar;
  const fmin = fit.objective;
  const chisq = 2 * n * fmin;
  const pvalue = df > 0 ? 1 - chisqCdf(chisq, df) : 1;

  // Baseline (independence) model: Sigma = diag(S) — closed form.
  const cholS = cholesky(s);
  const logDetS = logDetFromChol(cholS);
  const sumLogDiag = s.reduce((acc, row, i) => acc + Math.log(row[i]!), 0);
  const baselineF = sumLogDiag - logDetS;
  const baselineChisq = n * baselineF;
  const baselineDf = pstar - p;
  const baselinePvalue = baselineDf > 0 ? 1 - chisqCdf(baselineChisq, baselineDf) : 1;

  const t1 = Math.max(chisq - df, 0);
  const tb = Math.max(baselineChisq - baselineDf, 0);
  const cfi = 1 - t1 / Math.max(t1, tb);
  const tli =
    1 - ((chisq - df) / (baselineChisq - baselineDf)) * (baselineDf / df);

  // Log-likelihoods (likelihood = "normal": N-denominator S is the MLE).
  const sigma = impliedSigma(fit.matrices);
  const cholSigma = cholesky(sigma);
  const sigmaInv = cholInverse(sigma);
  let trace = 0;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) trace += s[i]![j]! * sigmaInv[j]![i]!;
  }
  const logl = (-n / 2) * (p * Math.log(2 * Math.PI) + logDetFromChol(cholSigma) + trace);
  const unrestrictedLogl = (-n / 2) * (p * Math.log(2 * Math.PI) + logDetS + p);
  const aic = -2 * logl + 2 * npar;
  const bic = -2 * logl + npar * Math.log(n);
  const bic2 = -2 * logl + npar * Math.log((n + 2) / 24);

  const rmsea = df > 0 ? Math.sqrt(Math.max((chisq - df) / (n * df), 0)) : 0;
  const { lower: rmseaCiLower, upper: rmseaCiUpper } = rmseaCi(chisq, df, n);
  const rmseaPvalue = df > 0 ? 1 - noncentralChisqCdf(chisq, df, n * df * 0.05 * 0.05) : Number.NaN;

  // SRMR (Bentler): residuals scaled by observed SDs, diagonal included.
  const sd = Array.from({ length: p }, (_, i) => Math.sqrt(s[i]![i]!));
  let ssq = 0;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j <= i; j++) {
      const resid = (s[i]![j]! - sigma[i]![j]!) / (sd[i]! * sd[j]!);
      ssq += resid * resid;
    }
  }
  const srmr = Math.sqrt(ssq / pstar);

  return {
    npar,
    fmin,
    chisq,
    df,
    pvalue,
    "baseline.chisq": baselineChisq,
    "baseline.df": baselineDf,
    "baseline.pvalue": baselinePvalue,
    cfi,
    tli,
    logl,
    "unrestricted.logl": unrestrictedLogl,
    aic,
    bic,
    bic2,
    ntotal: n,
    rmsea,
    "rmsea.ci.lower": rmseaCiLower,
    "rmsea.ci.upper": rmseaCiUpper,
    "rmsea.pvalue": rmseaPvalue,
    srmr,
  };
}
