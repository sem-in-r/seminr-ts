import { describe, it, expect } from "bun:test";
import {
  pnorm,
  pchisq,
  pt,
  logGamma,
  regularizedGammaP,
  incompleteBeta as csIncompleteBeta,
} from "@compstats/core/stats";
import {
  normalCdf,
  chisqCdf,
  noncentralChisqCdf,
  tCdf,
  lgamma,
  lowerRegGamma,
  incompleteBeta,
} from "../../src/math/distributions.ts";

/**
 * The evidence behind delegating `src/math/distributions.ts` to
 * `@compstats/core` (plan 010, slice 1), kept as a permanent record of what the
 * swap moved.
 *
 * Three columns per probe point, not two:
 *
 * - `r` — what R says, `options(digits = 17)`. R is this package's acceptance
 *   bar, so this is the only column that decides who is right.
 * - `legacy` — what the retired seminr-ts implementation returned (Lanczos plus
 *   the Numerical Recipes series and continued fractions), captured from
 *   `git show 3c3bf68:src/math/distributions.ts` before it was deleted.
 * - the live values, read from `src/math/distributions.ts` as it stands.
 *
 * Comparing only the two implementations to each other would say how far apart
 * they are and nothing about which moved toward R. With R in the table the
 * claim "the delegation is an improvement" is checked rather than asserted.
 *
 * R references:
 *   pnorm(x); pchisq(x, df); pchisq(x, df, ncp); pt(x, df)
 *   lgamma(x); pgamma(x, a); pbeta(x, a, b)
 */

/** [x, R's pnorm(x), legacy] */
const PNORM: [number, number, number][] = [
  [-8, 6.22096057427178486e-16, 6.10622663543836097e-16],
  [-4, 3.16712418331199243e-5, 3.16712418331199785e-5],
  [-1.96, 2.49978951482204281e-2, 2.49978951482204281e-2],
  [-1, 1.58655253931457046e-1, 1.58655253931456908e-1],
  [-0.5, 3.08537538725986937e-1, 3.08537538725986826e-1],
  [0, 5.0e-1, 5.0e-1],
  [0.5, 6.91462461274013007e-1, 6.91462461274013229e-1],
  [1, 8.41344746068542926e-1, 8.41344746068543037e-1],
  [1.96, 9.75002104851779627e-1, 9.75002104851779627e-1],
  [4, 9.99968328758166880e-1, 9.99968328758166880e-1],
  [8, 9.99999999999999334e-1, 9.99999999999999334e-1],
];

/** [x, df, R's pchisq(x, df), legacy] */
const PCHISQ: [number, number, number, number][] = [
  [10, 5, 9.24764753853487775e-1, 9.24764753853487997e-1],
  [55.3, 24, 9.99714826777184928e-1, 9.99714826777184928e-1],
  [200.1, 180, 8.54777480752691776e-1, 8.54777480752683227e-1],
  [3.2, 1, 9.26361729879697338e-1, 9.26361729879697338e-1],
  [250, 500, 5.35494369925830708e-23, 5.35494369926019257e-23],
  [1, 10, 1.72115629955840721e-4, 1.72115629955841047e-4],
  [120, 100, 9.15593318906308129e-1, 9.15593318906308018e-1],
];

/** [x, df, ncp, R's pchisq(x, df, ncp), legacy] */
const PCHISQ_NCP: [number, number, number, number, number][] = [
  [55.3, 24, 30, 5.67213243913883058e-1, 5.67213243913882059e-1],
  [10, 5, 2, 7.92271105433910217e-1, 7.92271105433909995e-1],
  [300, 100, 150, 9.56132592669306836e-1, 9.56132592669304726e-1],
  [25, 100, 150, 2.72559381702103697e-41, 1.89462230371482440e-41],
  [200, 24, 30, 9.99999999999937716e-1, 9.99999999999938494e-1],
];

/** [x, df, R's pt(x, df), legacy] */
const PT: [number, number, number, number][] = [
  [2.1, 30, 9.77878764368838249e-1, 9.77878764368838138e-1],
  [-1.7, 8, 6.37764348516171448e-2, 6.37764348516171448e-2],
  [0.3, 200, 6.17755634905336026e-1, 6.17755634905327256e-1],
  [-1.7, 1000, 4.47209434796200303e-2, 4.47209434793774396e-2],
  [-6, 1, 5.25684567112534237e-2, 5.25684567112534792e-2],
  [1.5, 2, 8.63803437554499509e-1, 8.63803437554499176e-1],
];

/** [x, R's lgamma(x), legacy] */
const LGAMMA: [number, number, number][] = [
  [0.5, 5.72364942924700082e-1, 5.72364942924699527e-1],
  [1, 0, -8.88178419700125232e-16],
  [1.5, -1.20782237635245177e-1, -1.20782237635244982e-1],
  [2, 0, 0],
  [4.5, 2.45373657084244234, 2.45373657084244234],
  [10, 1.28018274800814691e1, 1.28018274800814744e1],
  [100, 3.59134205369575454e2, 3.59134205369575341e2],
  [1000, 5.90522042320918081e3, 5.90522042320918081e3],
];

/** [a, x, R's pgamma(x, a), legacy] */
const PGAMMA: [number, number, number, number][] = [
  [0.5, 0.25, 5.20499877813046519e-1, 5.20499877813046852e-1],
  [1, 1, 6.32120558828557666e-1, 6.32120558828558332e-1],
  [2, 1, 2.64241117657115276e-1, 2.64241117657115276e-1],
  [5, 5, 5.59506714934787541e-1, 5.59506714934788318e-1],
  [20, 10, 3.45434197585680865e-3, 3.45434197585683207e-3],
  [100, 120, 9.72136260109479400e-1, 9.72136260109478290e-1],
];

/** [x, a, b, R's pbeta(x, a, b), legacy] */
const PBETA: [number, number, number, number, number][] = [
  [0.05, 0.5, 0.5, 1.43566293128706224e-1, 1.43566293128706307e-1],
  [0.25, 1, 3, 5.78124999999999778e-1, 5.78124999999999889e-1],
  [0.5, 2, 2, 5.0e-1, 5.00000000000000222e-1],
  [0.75, 5, 10, 9.99658126384019852e-1, 9.99658126384019852e-1],
  [0.95, 20, 0.5, 1.54590781433438185e-1, 1.54590781433444402e-1],
  [0.3, 0.5, 10, 9.91677495137535781e-1, 9.91677495137535781e-1],
];

/**
 * Upper tails, where the CBSEM code actually lives and a lower-tail comparison
 * is blind. `fitMeasures.ts` forms `rmsea.pvalue` and its five relatives as
 * `1 - noncentralChisqCdf(...)`, so what matters there is the *absolute*
 * accuracy of a lower tail sitting a few nanometres below 1 — a quantity a
 * relative check against a lower-tail value near 1 cannot see at all.
 *
 * [x, df, ncp, R's pchisq(x, df, ncp, lower.tail = FALSE), legacy 1 - lower]
 */
const PCHISQ_NCP_UPPER: [number, number, number, number, number][] = [
  [36, 24, 0, 5.48874244881894235e-2, 5.48874244881890627e-2],
  [78, 24, 15, 1.07928642693050142e-3, 1.07928642692967092e-3],
  [388.8, 24, 300, 3.79078269339454543e-2, 3.79078269340047402e-2],
  [200, 100, 0, 1.17845007209794202e-8, 1.17845007086003761e-8],
  [253.5, 100, 111.25, 5.37531094361375361e-2, 5.37531094361821671e-2],
  [600, 100, 300, 8.43988389509497949e-7, 8.43988415377694423e-7],
  [289.5, 178, 15, 1.65187550436638593e-5, 1.65187550427159380e-5],
  [717, 178, 300, 3.37592067634062687e-8, 3.37592160892796755e-8],
  [472.5, 300, 15, 4.17686075225750632e-8, 4.17686064624334108e-8],
  [900, 300, 300, 1.88668303202632615e-10, 1.88747573126590851e-10],
];

const relative = (value: number, reference: number) =>
  reference === 0 ? Math.abs(value) : Math.abs(value - reference) / Math.abs(reference);

interface Case {
  label: string;
  /** What `src/math/distributions.ts` returns now. */
  current: number;
  /** What `@compstats/core` returns for the same call. */
  compstats: number;
  /** What the retired hand-written implementation returned. */
  legacy: number;
  /** What R returns. */
  r: number;
  /**
   * True for the CDFs, whose values live in [0, 1], so an absolute bound is the
   * meaningful one. False for lgamma, which reaches 5.9e3.
   */
  probability: boolean;
}

const CASES: Case[] = [
  ...PNORM.map(([x, r, legacy]) => ({
    label: `pnorm(${x})`,
    current: normalCdf(x),
    compstats: pnorm(x),
    legacy,
    r,
    probability: true,
  })),
  ...PCHISQ.map(([x, df, r, legacy]) => ({
    label: `pchisq(${x}, ${df})`,
    current: chisqCdf(x, df),
    compstats: pchisq(x, df),
    legacy,
    r,
    probability: true,
  })),
  ...PCHISQ_NCP.map(([x, df, ncp, r, legacy]) => ({
    label: `pchisq(${x}, ${df}, ${ncp})`,
    current: noncentralChisqCdf(x, df, ncp),
    compstats: pchisq(x, df, ncp),
    legacy,
    r,
    probability: true,
  })),
  ...PT.map(([x, df, r, legacy]) => ({
    label: `pt(${x}, ${df})`,
    current: tCdf(x, df),
    compstats: pt(x, df),
    legacy,
    r,
    probability: true,
  })),
  ...LGAMMA.map(([x, r, legacy]) => ({
    label: `lgamma(${x})`,
    current: lgamma(x),
    compstats: logGamma(x),
    legacy,
    r,
    probability: false,
  })),
  ...PGAMMA.map(([a, x, r, legacy]) => ({
    label: `pgamma(${x}, ${a})`,
    current: lowerRegGamma(a, x),
    compstats: regularizedGammaP(a, x),
    legacy,
    r,
    probability: true,
  })),
  ...PBETA.map(([x, a, b, r, legacy]) => ({
    label: `pbeta(${x}, ${a}, ${b})`,
    current: incompleteBeta(x, a, b),
    compstats: csIncompleteBeta(x, a, b),
    legacy,
    r,
    probability: true,
  })),
];

describe("src/math/distributions.ts delegates to @compstats/core", () => {
  it("returns exactly what @compstats/core returns, bit for bit", () => {
    // The delegation itself: seminr-ts's names must be a pure renaming, with no
    // wrapper arithmetic of their own. Exact equality, not closeness.
    const wrapped = CASES.filter(({ current, compstats }) => !Object.is(current, compstats)).map(
      ({ label }) => label,
    );
    expect(wrapped).toEqual([]);
  });

  it("is what R says, to 1e-12 relative, on every probe point", () => {
    // The property the delegation inherits: @compstats/core follows R's own
    // nmath sources. Worst observed on this grid is 1.2e-13, at
    // pchisq(250, 500) — a value of 5.4e-23, where a relative comparison is
    // reading R's own last two digits. The worst among values a reader would
    // ever see is 2.8e-14. Note lgamma(1) and lgamma(2) are exactly 0 in R,
    // where `relative` falls back to the absolute error.
    const off = CASES.filter(({ current, r }) => relative(current, r) > 1e-12).map(
      ({ label, current, r }) => `${label}: ${current} vs R ${r}`,
    );
    expect(off).toEqual([]);
  });

  it("moved no value the retired implementation already had right", () => {
    // Where the old code was itself within 1e-13 of R, the swap must not push
    // it outside that band. This is the "no fixture digit moves" claim, checked
    // point by point rather than inferred from the suite passing.
    const regressions = CASES.filter(
      ({ legacy, current, r }) => relative(legacy, r) <= 1e-13 && relative(current, r) > 1e-13,
    ).map(({ label }) => label);
    expect(regressions).toEqual([]);
  });

  it("is strictly closer to R everywhere the swap moved a value beyond 1e-13", () => {
    // The moves are real and all point the same way. On this grid they are
    // pnorm's far tail (|z| = 8, where the Lanczos path had lost two digits of
    // a 6e-16 value), the noncentral chi-square deep tail, and pt at df = 1000
    // — the one case here whose value a user would actually read, where the old
    // code sat 5.4e-12 off R relative and the delegation sits 1.4e-14.
    const moved = CASES.filter(({ legacy, current }) => relative(legacy, current) > 1e-13);
    expect(moved.length).toBeGreaterThan(0);
    const worse = moved
      .filter(({ legacy, current, r }) => relative(current, r) >= relative(legacy, r))
      .map(({ label }) => label);
    expect(worse).toEqual([]);
  });

  it("moved no probability by more than 1e-12 in absolute terms", () => {
    // The bound that protects the CBSEM fixtures, which assert pvalue at 8
    // decimal digits, baseline.pvalue at 10 and rmsea.pvalue at 7 — nothing
    // this small can reach an assertion. Worst observed: 2.4e-13, at
    // pt(-1.7, 1000). Restricted to the CDFs; lgamma reaches 5.9e3, where an
    // absolute bound says nothing (its relative agreement is 1.5e-16).
    const worst = Math.max(
      ...CASES.filter((c) => c.probability).map(({ legacy, current }) =>
        Math.abs(legacy - current),
      ),
    );
    expect(worst).toBeLessThan(1e-12);
  });
});

describe("the noncentral chi-square upper tail, as fitMeasures forms it", () => {
  const UPPER = PCHISQ_NCP_UPPER.map(([x, df, ncp, r, legacy]) => ({
    label: `1 - pchisq(${x}, ${df}, ${ncp})`,
    current: 1 - noncentralChisqCdf(x, df, ncp),
    legacy,
    r,
  }));

  it("is within 1e-4 relative of R", () => {
    // A deliberately loose bound, and an honest one: this quantity is formed by
    // subtracting a number just below 1 from 1, so it inherits the *absolute*
    // error of the lower tail divided by a value that can be 1e-10. R keeps a
    // separate upper-tail path and does not pay that; seminr-ts does. Worst
    // observed here is 1.0e-5. In fixture terms this is nothing — rmsea.pvalue
    // is asserted at 7 decimal digits, and 1e-5 relative on a 1e-8 p-value is
    // an absolute move of 1e-13.
    const off = UPPER.filter(({ current, r }) => relative(current, r) > 1e-4).map(
      ({ label, current, r }) => `${label}: ${current} vs R ${r}`,
    );
    expect(off).toEqual([]);
  });

  it("is a large improvement on the retired implementation, in the worst case", () => {
    // This is the tail the RMSEA close-fit p-values are read from, and it is
    // where the delegation pays for itself: the retired Poisson-weighted
    // mixture reached 3.8e-3 relative error over this grid.
    const worstCurrent = Math.max(...UPPER.map(({ current, r }) => relative(current, r)));
    const worstLegacy = Math.max(...UPPER.map(({ legacy, r }) => relative(legacy, r)));
    expect(worstCurrent).toBeLessThan(worstLegacy / 100);
  });

  it("is closer to R on most points, but not on every one", () => {
    // Recorded rather than asserted away. Both implementations subtract from 1,
    // so on any single point either can land nearer by luck. The one that
    // matters in practice is the ECSI model's rmsea.pvalue, where the swap
    // moved the value 6.1e-14 *away* from lavaan (1.9867554e-9 → 1.9866874e-9
    // against lavaan's 1.9867483e-9) — six orders of magnitude inside the
    // fixture's tolerance, and against a median error 40x better across this
    // grid. See plan 010 slice 1c.
    const better = UPPER.filter(
      ({ current, legacy, r }) => relative(current, r) < relative(legacy, r),
    ).length;
    expect(better).toBeGreaterThan(UPPER.length / 2);
  });
});
