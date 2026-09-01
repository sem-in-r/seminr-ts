/**
 * Distribution functions needed for SEM inference (normal, chi-square, t,
 * gamma, beta).
 *
 * These are delegations to `@compstats/core`, kept behind seminr-ts's own
 * names and argument order so `@seminr/core/math` importers see no change.
 *
 * Why delegate. The implementations that stood here were Lanczos plus the
 * Numerical Recipes series and continued fractions; `@compstats/core` follows
 * R's own `nmath` sources instead (`pnchisq.c` for the noncentral chi-square,
 * `pnt.c` for the t, and the tail-preserving `Q(1/2, z^2/2)` identity for the
 * normal), and its values are pinned to R by conformance fixtures. R is this
 * package's acceptance bar, so where the two ever disagreed, the R-pinned one
 * is the correct one to keep.
 *
 * What that cost, measured in `tests/math/compstats-agreement.test.ts` against
 * R reference values rather than against the old code: nothing a fixture can
 * see. No probability moves by more than 2.4e-13 in absolute terms, against
 * CBSEM assertions at 7-10 decimal digits. What it bought: the far tails.
 * `pt(-1.7, 1000)` was 5.4e-12 off R relative and is now 1.4e-14; `pnorm(-8)`
 * had lost two of its digits.
 *
 * `noncentralChisqCdf` and `chisqCdf` are R's one `pchisq` split in two, which
 * is how seminr-ts's callers read them.
 *
 * **Every delegation here carries an explicit type annotation, on purpose.**
 * `@compstats/core` 0.5.0 ships `.d.ts` files whose relative re-exports have no
 * file extension (`export { mean } from "./core/arith"`), which Node16/NodeNext
 * module resolution rejects — TS2834. This package resolves modules as NodeNext
 * (it publishes to npm), and `skipLibCheck: true` swallows the error, so every
 * name imported from `@compstats/core` arrives as `any` and would silently
 * infect our own published declarations. Annotating the boundary keeps
 * `@seminr/core/math`'s types exact whatever upstream's packaging does;
 * `tests/math/compstats-types.test.ts` fails if an `any` ever leaks back in.
 * Reported upstream — see plan 010, task 4f.
 */

import {
  pnorm,
  pchisq,
  pt,
  logGamma,
  regularizedGammaP,
  incompleteBeta as csIncompleteBeta,
} from "@compstats/core";

/** log Gamma(x) for x > 0 (R's `lgamma`). */
export const lgamma: (x: number) => number = logGamma;

/** Regularized lower incomplete gamma P(a, x) (R's `pgamma(x, a)`). */
export const lowerRegGamma: (a: number, x: number) => number = regularizedGammaP;

/** Regularized incomplete beta function I_x(a, b) (R's `pbeta(x, a, b)`). */
export const incompleteBeta: (x: number, a: number, b: number) => number = csIncompleteBeta;

/** Student-t CDF (R's `pt(x, df)`). */
export function tCdf(x: number, df: number): number {
  return pt(x, df);
}

/** Standard normal CDF (R's `pnorm(x)`). */
export function normalCdf(x: number): number {
  return pnorm(x);
}

/** Central chi-square CDF (R's `pchisq(x, df)`). */
export function chisqCdf(x: number, df: number): number {
  return pchisq(x, df);
}

/** Noncentral chi-square CDF (R's `pchisq(x, df, ncp)`). */
export function noncentralChisqCdf(x: number, df: number, ncp: number): number {
  return pchisq(x, df, ncp);
}
