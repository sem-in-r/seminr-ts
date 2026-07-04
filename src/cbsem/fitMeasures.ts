/**
 * Fit measures matching lavaan's fitMeasures() under estimator ML, single
 * group, complete data, no meanstructure — plus, when the MLR robust layer is
 * supplied, the Yuan-Bentler-Mplus `.scaled` and Brosseau-Liard/Savalei
 * `.robust` columns (lav_fit_cfi.R, lav_fit_rmsea.R, lav_fit_measures.R).
 */

import type { Matrix } from "../math/matrix.ts";
import { cholesky, logDetFromChol, cholInverse } from "../math/cholesky.ts";
import { chisqCdf, noncentralChisqCdf } from "../math/distributions.ts";
import type { CbsemParTable } from "./partable.ts";
import { impliedSigma } from "./sigma.ts";
import type { MlFitResult } from "./mlFit.ts";
import type { RobustLayer } from "./robust.ts";

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

// --- incremental fit family (lav_fit_cfi.R; c.hat/c.hat.null give the robust
// --- Brosseau-Liard & Savalei 2014 variants when both differ from 1) --------

function cfiOf(x2: number, df: number, x2n: number, dfn: number, cHat = 1, cHatN = 1): number {
  const t1 = Math.max(x2 - cHat * df, 0);
  const t2 = Math.max(x2 - cHat * df, x2n - cHatN * dfn, 0);
  return t2 === 0 ? 1 : 1 - t1 / t2;
}

function rniOf(x2: number, df: number, x2n: number, dfn: number, cHat = 1, cHatN = 1): number {
  const t1 = x2 - cHat * df;
  const t2 = x2n - cHatN * dfn;
  return t2 === 0 ? Number.NaN : 1 - t1 / t2;
}

function tliOf(x2: number, df: number, x2n: number, dfn: number, cHat = 1, cHatN = 1): number {
  const t1 = (x2 - cHat * df) * dfn;
  const t2 = (x2n - cHatN * dfn) * df;
  if (df > 0 && Math.abs(t2) > 0) return 1 - t1 / t2;
  return 1;
}

function rfiOf(x2: number, df: number, x2n: number, dfn: number): number {
  if (df > dfn) return Number.NaN;
  if (df > 0 && dfn > 0) {
    const t1 = x2n / dfn - x2 / df;
    const t2 = x2n / dfn;
    if (t1 < 0 || t2 < 0) return 1;
    return t1 / t2;
  }
  return 1;
}

function nfiOf(x2: number, df: number, x2n: number, dfn: number): number {
  if (df > dfn || x2n === 0) return Number.NaN;
  if (df > 0) return (x2n - x2) / x2n;
  return 1;
}

function pnfiOf(x2: number, df: number, x2n: number, dfn: number): number {
  if (dfn > 0 && x2n > 0) return (df / dfn) * ((x2n - x2) / x2n);
  return Number.NaN;
}

function ifiOf(x2: number, df: number, x2n: number): number {
  const t1 = x2n - x2;
  const t2 = x2n - df;
  if (t2 < 0) return 1;
  if (t2 === 0) return Number.NaN;
  return t1 / t2;
}

// --- RMSEA family (lav_fit_rmsea.R; general form with c.hat) ----------------

function rmseaOf(x2: number, df: number, n: number, cHat = 1): number {
  if (!(df > 0)) return 0;
  return Math.sqrt(Math.max((x2 / n) / df - cHat / n, 0));
}

/** 90% RMSEA confidence bounds via noncentral chi-square inversion. */
function rmseaCi(
  x2: number,
  df: number,
  n: number,
  cHat = 1,
): { lower: number; upper: number } {
  const upperPerc = 0.95;
  const lowerPerc = 0.05;
  const lowerLambda = (l: number) => noncentralChisqCdf(x2, df, l) - upperPerc;
  const upperLambda = (l: number) => noncentralChisqCdf(x2, df, l) - lowerPerc;

  let lower = 0;
  if (df >= 1 && lowerLambda(0) >= 0) {
    lower = Math.sqrt((cHat * bisect(lowerLambda, 0, x2)) / (n * df));
  }
  let upper = 0;
  const nRmsea = Math.max(n, x2 * 4);
  if (df >= 1 && upperLambda(nRmsea) <= 0 && upperLambda(0) >= 0) {
    upper = Math.sqrt((cHat * bisect(upperLambda, 0, nRmsea)) / (n * df));
  }
  return { lower, upper };
}

/** P(RMSEA <= h0 rejected): 1 - pchisq(X2, df, ncp = N df h0^2 / c.hat). */
function rmseaClosefit(x2: number, df: number, n: number, cHat = 1, h0 = 0.05): number {
  if (!(df > 0)) return Number.NaN;
  return 1 - noncentralChisqCdf(x2, df, (n * df * h0 * h0) / cHat);
}

/** MacCallum et al. not-close-fit: pchisq(X2, df, ncp = N df h0^2 / c.hat). */
function rmseaNotclosefit(x2: number, df: number, n: number, cHat = 1, h0 = 0.08): number {
  if (!(df > 0)) return Number.NaN;
  return noncentralChisqCdf(x2, df, (n * df * h0 * h0) / cHat);
}

export function fitMeasures(
  pt: CbsemParTable,
  s: Matrix,
  fit: MlFitResult,
  n: number,
  robust?: RobustLayer,
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

  const { lower: rmseaCiLower, upper: rmseaCiUpper } = rmseaCi(chisq, df, n);

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

  const out: Record<string, number> = {
    npar,
    fmin,
    chisq,
    df,
    pvalue,
    "baseline.chisq": baselineChisq,
    "baseline.df": baselineDf,
    "baseline.pvalue": baselinePvalue,
    cfi: cfiOf(chisq, df, baselineChisq, baselineDf),
    tli: tliOf(chisq, df, baselineChisq, baselineDf),
    nnfi: tliOf(chisq, df, baselineChisq, baselineDf),
    rfi: rfiOf(chisq, df, baselineChisq, baselineDf),
    nfi: nfiOf(chisq, df, baselineChisq, baselineDf),
    pnfi: pnfiOf(chisq, df, baselineChisq, baselineDf),
    ifi: ifiOf(chisq, df, baselineChisq),
    rni: rniOf(chisq, df, baselineChisq, baselineDf),
    logl,
    "unrestricted.logl": unrestrictedLogl,
    aic,
    bic,
    bic2,
    ntotal: n,
    rmsea: rmseaOf(chisq, df, n),
    "rmsea.ci.lower": rmseaCiLower,
    "rmsea.ci.upper": rmseaCiUpper,
    "rmsea.ci.level": 0.9,
    "rmsea.pvalue": rmseaClosefit(chisq, df, n),
    "rmsea.close.h0": 0.05,
    "rmsea.notclose.pvalue": rmseaNotclosefit(chisq, df, n),
    "rmsea.notclose.h0": 0.08,
    srmr,
  };

  if (!robust) return out;

  // --- Yuan-Bentler-Mplus scaled + robust columns ---------------------------
  const c = robust.scalingFactor;
  const cB = robust.baselineScalingFactor;
  const chisqScaled = chisq / c;
  const baselineChisqScaled = baselineChisq / cB;
  const dfScaled = df;
  const baselineDfScaled = baselineDf;

  out["chisq.scaled"] = chisqScaled;
  out["df.scaled"] = dfScaled;
  out["pvalue.scaled"] = df > 0 ? 1 - chisqCdf(chisqScaled, df) : 1;
  out["chisq.scaling.factor"] = c;
  out["baseline.chisq.scaled"] = baselineChisqScaled;
  out["baseline.df.scaled"] = baselineDfScaled;
  out["baseline.pvalue.scaled"] =
    baselineDf > 0 ? 1 - chisqCdf(baselineChisqScaled, baselineDf) : 1;
  out["baseline.chisq.scaling.factor"] = cB;

  out["cfi.scaled"] = cfiOf(chisqScaled, df, baselineChisqScaled, baselineDf);
  out["tli.scaled"] = tliOf(chisqScaled, df, baselineChisqScaled, baselineDf);
  out["cfi.robust"] = cfiOf(chisq, df, baselineChisq, baselineDf, c, cB);
  out["tli.robust"] = tliOf(chisq, df, baselineChisq, baselineDf, c, cB);
  out["nnfi.scaled"] = out["tli.scaled"]!;
  out["nnfi.robust"] = out["tli.robust"]!;
  out["rfi.scaled"] = rfiOf(chisqScaled, df, baselineChisqScaled, baselineDf);
  out["nfi.scaled"] = nfiOf(chisqScaled, df, baselineChisqScaled, baselineDf);
  out["pnfi.scaled"] = pnfiOf(chisqScaled, df, baselineChisqScaled, baselineDf);
  out["ifi.scaled"] = ifiOf(chisqScaled, df, baselineChisqScaled);
  out["rni.scaled"] = rniOf(chisqScaled, df, baselineChisqScaled, baselineDf);
  out["rni.robust"] = rniOf(chisq, df, baselineChisq, baselineDf, c, cB);

  out["scaling.factor.h1"] = robust.scalingFactorH1;
  out["scaling.factor.h0"] = robust.scalingFactorH0;

  // Scaled RMSEA: raw statistic against df2 = trace(U Gamma)
  // (lav_fit_rmsea.R:332-341: XX2 = X2, df2 = sum(trace.UGamma)).
  const df2 = robust.traceUGamma;
  out["rmsea.scaled"] = rmseaOf(chisq, df2, n);
  const ciScaled = rmseaCi(chisq, df2, n);
  out["rmsea.ci.lower.scaled"] = ciScaled.lower;
  out["rmsea.ci.upper.scaled"] = ciScaled.upper;
  out["rmsea.pvalue.scaled"] = rmseaClosefit(chisq, df2, n);
  out["rmsea.notclose.pvalue.scaled"] = rmseaNotclosefit(chisq, df2, n);

  // Robust RMSEA: raw statistic with c.hat; CI/pvalues from the scaled
  // statistic (lav_fit_rmsea.R:425-495).
  out["rmsea.robust"] = rmseaOf(chisq, df, n, c);
  const ciRobust = rmseaCi(chisqScaled, df, n, c);
  out["rmsea.ci.lower.robust"] = ciRobust.lower;
  out["rmsea.ci.upper.robust"] = ciRobust.upper;
  out["rmsea.pvalue.robust"] = rmseaClosefit(chisqScaled, df, n, c);
  out["rmsea.notclose.pvalue.robust"] = rmseaNotclosefit(chisqScaled, df, n, c);

  return out;
}
