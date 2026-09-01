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
 * Imported from `@compstats/core/stats`, the DOM-free entry: 120 KB against the
 * root entry's 176 KB, and asserted upstream to reach no `plot/` or
 * `interactive/` module and to name no DOM global. `src/` must stay
 * runtime-agnostic, so this is the door to use.
 *
 * **Every delegation here carries an explicit type annotation, on purpose.**
 * `@compstats/core` 0.5.0 shipped `.d.ts` files whose relative re-exports had no
 * file extension (`export { mean } from "./core/arith"`), which Node16/NodeNext
 * module resolution rejects — TS2834. This package resolves modules as NodeNext
 * (it publishes to npm), and `skipLibCheck: true` swallows the error, so every
 * name arrived as `any` and would silently have infected our own published
 * declarations. **0.6.0 fixed it** — `pchisq("hello", {}, [], 1, 2, 3)` is now a
 * compile error here, where under 0.5.0 it was not — so the annotations are no
 * longer load-bearing. They stay because they cost nothing, they state the
 * contract at the boundary, and they are what would keep our published types
 * exact if a future upstream release regressed under `skipLibCheck`.
 * `tests/math/compstats-types.test.ts` checks the upstream property directly
 * and keeps the annotation rule behind it. Reported upstream — plan 010, 4f;
 * their reply is plan 011's `NOTE-for-seminr-ts-2.md` §1.
 */

import {
  pnorm,
  pchisq,
  pt,
  logGamma,
  regularizedGammaP,
  incompleteBeta as csIncompleteBeta,
} from "@compstats/core/stats";

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

/**
 * Central chi-square **upper** tail (R's `pchisq(x, df, lower.tail = FALSE)`).
 *
 * A separate calculation, not `1 - chisqCdf(x, df)`, and the difference is the
 * point. A lower tail sitting just below 1 carries absolute error that the
 * subtraction then divides by a probability as small as 1e-10, so every digit
 * of a small right-tail probability comes from the subtraction rather than from
 * the series. In the far tail the subtraction has no digits at all to give:
 * `1 - pchisq(1000, 300)` is exactly 0, where the probability is 3.7e-76.
 *
 * Measured in plan 010 (task 1c): R's own upper tail differs from `1 - lower`
 * at 31 of 64 grid points in the RMSEA regime, and over that grid it improves
 * the median error against R by 5×, from 5.08e-14 to 1.06e-14. It does not move
 * the worst case, which is the noncentral series itself.
 *
 * **What it changes in practice, stated concretely** (plan 011, slice E): on the
 * ECSI model the model chi-square p-value goes from exactly 0 to
 * 2.9855443664951668e-30, against R's 2.9855443665871887e-30. Every other fit
 * measure moves by at most 5.6e-16. Note that lavaan itself forms these as
 * `1 - pchisq(...)` and so reports 0 here, which is why our fixtures store 0:
 * this is a deliberate departure from the reference, in the direction of the
 * number being right. Nothing that reads a p-value as a decision at 0.05, 0.01
 * or 0.001 can tell the difference.
 */
export function chisqUpperTail(x: number, df: number): number {
  return pchisq(x, df, 0, { lowerTail: false });
}

/**
 * Noncentral chi-square **upper** tail
 * (R's `pchisq(x, df, ncp, lower.tail = FALSE)`). See {@link chisqUpperTail}.
 */
export function noncentralChisqUpperTail(x: number, df: number, ncp: number): number {
  return pchisq(x, df, ncp, { lowerTail: false });
}
