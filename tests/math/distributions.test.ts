import { describe, it, expect } from "bun:test";
import {
  normalCdf,
  chisqCdf,
  noncentralChisqCdf,
  incompleteBeta,
  tCdf,
} from "../../src/math/distributions.ts";

// R references (options(digits=17)): pnorm / pchisq values below.

describe("normalCdf", () => {
  it("matches R pnorm", () => {
    expect(normalCdf(-3.2)).toBeCloseTo(0.0006871379379158481, 14);
    expect(normalCdf(-1)).toBeCloseTo(0.158655253931457, 13);
    expect(normalCdf(0)).toBeCloseTo(0.5, 15);
    expect(normalCdf(0.5)).toBeCloseTo(0.691462461274013, 13);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517796, 13);
    expect(normalCdf(4.1)).toBeCloseTo(0.9999793424930875, 13);
  });
});

describe("chisqCdf", () => {
  it("matches R pchisq for small df", () => {
    expect(chisqCdf(0.5, 1)).toBeCloseTo(0.5204998778130465, 12);
    expect(chisqCdf(3.84, 1)).toBeCloseTo(0.949956478751295, 12);
    expect(chisqCdf(10, 4)).toBeCloseTo(0.9595723180054871, 12);
    expect(chisqCdf(25, 21)).toBeCloseTo(0.7528359210773401, 12);
  });

  it("matches R pchisq for model-scale df", () => {
    expect(chisqCdf(94, 94)).toBeCloseTo(0.51939942101891, 11);
    // upper tail saturates
    expect(chisqCdf(453.3203, 94)).toBeCloseTo(1, 14);
    expect(chisqCdf(266.933, 84)).toBeCloseTo(1, 14);
  });

  it("is 0 at or below zero", () => {
    expect(chisqCdf(0, 5)).toBe(0);
    expect(chisqCdf(-1, 5)).toBe(0);
  });
});

describe("noncentralChisqCdf", () => {
  it("matches R pchisq(..., ncp=...)", () => {
    expect(noncentralChisqCdf(94, 94, 20)).toBeCloseTo(0.1053162239003723, 10);
    expect(noncentralChisqCdf(120, 94, 35.5)).toBeCloseTo(0.3118661206821598, 10);
    expect(noncentralChisqCdf(453.32, 94, 300)).toBeCloseTo(0.9402389536188352, 10);
  });

  it("handles extreme underflow tails", () => {
    // R: pchisq(10, df=94, ncp=0.5) = 1.651242819423293e-29
    const p = noncentralChisqCdf(10, 94, 0.5);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1e-25);
  });

  it("reduces to the central chi-square at ncp=0", () => {
    expect(noncentralChisqCdf(25, 21, 0)).toBeCloseTo(0.7528359210773401, 10);
  });
});

describe("incompleteBeta", () => {
  it("clamps outside the unit interval", () => {
    expect(incompleteBeta(0, 0.5, 0.5)).toBe(0);
    expect(incompleteBeta(1, 0.5, 0.5)).toBe(1);
    expect(incompleteBeta(-0.2, 2, 3)).toBe(0);
    expect(incompleteBeta(1.5, 2, 3)).toBe(1);
  });

  it("matches the closed form I_x(0.5,0.5) = (2/pi) arcsin(sqrt(x))", () => {
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const exact = (2 / Math.PI) * Math.asin(Math.sqrt(x));
      expect(incompleteBeta(x, 0.5, 0.5)).toBeCloseTo(exact, 14);
    }
  });

  it("matches R pbeta for integer parameters", () => {
    // R: pbeta(0.3, 2, 3) = 0.3483 (closed form 6·.3²·.7² + 4·.3³·.7 + .3⁴)
    expect(incompleteBeta(0.3, 2, 3)).toBeCloseTo(0.3483, 14);
    // R: pbeta(0.7, 5, 2) = 0.420175 (closed form 6·.7⁵·.3 + .7⁶)
    expect(incompleteBeta(0.7, 5, 2)).toBeCloseTo(0.420175, 14);
  });
});

describe("tCdf", () => {
  it("handles special inputs", () => {
    expect(tCdf(0, 5)).toBe(0.5);
    expect(tCdf(Infinity, 5)).toBe(1);
    expect(tCdf(-Infinity, 5)).toBe(0);
    expect(Number.isNaN(tCdf(NaN, 5))).toBe(true);
  });

  it("is symmetric: tCdf(-x) = 1 - tCdf(x)", () => {
    for (const df of [1, 5, 29, 299]) {
      for (const x of [0.3, 1.96, 4]) {
        expect(tCdf(-x, df)).toBeCloseTo(1 - tCdf(x, df), 15);
      }
    }
  });

  // R reference: pt(x, df) printed with options(digits=17) (%.17g).
  const tCases: { x: number; df: number; p: number }[] = [
    { x: -30, df: 1, p: 0.010606402405535424 },
    { x: -5, df: 1, p: 0.06283295818900117 },
    { x: -2.5, df: 1, p: 0.12111894159084335 },
    { x: -1, df: 1, p: 0.24999999999999978 },
    { x: -0.1, df: 1, p: 0.46827448256944643 },
    { x: 0, df: 1, p: 0.5 },
    { x: 0.3, df: 1, p: 0.59277357907774231 },
    { x: 1.96, df: 1, p: 0.84982855411198344 },
    { x: 4, df: 1, p: 0.92202086962263063 },
    { x: 25, df: 1, p: 0.98727438865200812 },
    { x: -30, df: 2, p: 0.00055463134097982942 },
    { x: -5, df: 2, p: 0.018874775675311862 },
    { x: -2.5, df: 2, p: 0.064805860110755398 },
    { x: -1, df: 2, p: 0.21132486540518713 },
    { x: -0.1, df: 2, p: 0.46473271920707004 },
    { x: 0, df: 2, p: 0.5 },
    { x: 0.3, df: 2, p: 0.60375716957991121 },
    { x: 1.96, df: 2, p: 0.90547134519913386 },
    { x: 4, df: 2, p: 0.97140452079103168 },
    { x: 25, df: 2, p: 0.99920191489429477 },
    { x: -30, df: 5, p: 3.8593243102480234e-7 },
    { x: -5, df: 5, p: 0.0020523579900266612 },
    { x: -2.5, df: 5, p: 0.027245049671188105 },
    { x: -1, df: 5, p: 0.18160873382456127 },
    { x: -0.1, df: 5, p: 0.4621150705773302 },
    { x: 0, df: 5, p: 0.5 },
    { x: 0.3, df: 5, p: 0.61187547886836269 },
    { x: 1.96, df: 5, p: 0.94635602374735295 },
    { x: 4, df: 5, p: 0.9948382922595842 },
    { x: 25, df: 5, p: 0.99999904466110778 },
    { x: -30, df: 29, p: 1.0988724225494054e-23 },
    { x: -5, df: 29, p: 1.2683157867711581e-5 },
    { x: -2.5, df: 29, p: 0.0091626721692130344 },
    { x: -1, df: 29, p: 0.16279099400809682 },
    { x: -0.1, df: 29, p: 0.46051622224368688 },
    { x: 0, df: 29, p: 0.5 },
    { x: 0.3, df: 29, p: 0.6168414533355161 },
    { x: 1.96, df: 29, p: 0.97016610224020439 },
    { x: 4, df: 29, p: 0.99979996802717375 },
    { x: 25, df: 29, p: 1 },
    { x: -30, df: 99, p: 8.504249558641016e-52 },
    { x: -5, df: 99, p: 1.2406980065204751e-6 },
    { x: -2.5, df: 99, p: 0.0070312984605745317 },
    { x: -1, df: 99, p: 0.1598742370696509 },
    { x: -0.1, df: 99, p: 0.46027327536879115 },
    { x: 0, df: 99, p: 0.5 },
    { x: 0.3, df: 99, p: 0.61759691912987136 },
    { x: 1.96, df: 99, p: 0.97359644312451454 },
    { x: 4, df: 99, p: 0.99993887423621453 },
    { x: 25, df: 99, p: 1 },
    { x: -30, df: 299, p: 1.7943056720309799e-92 },
    { x: -5, df: 299, p: 4.8928454948489363e-7 },
    { x: -2.5, df: 299, p: 0.0064774543346210129 },
    { x: -1, df: 299, p: 0.15905954873944234 },
    { x: -0.1, df: 299, p: 0.46020567046745214 },
    { x: 0, df: 299, p: 0.5 },
    { x: 0.3, df: 299, p: 0.61780719331267897 },
    { x: 1.96, df: 299, p: 0.97453782431136227 },
    { x: 4, df: 299, p: 0.99996005009118516 },
    { x: 25, df: 299, p: 1 },
  ];

  it("matches R pt within 1e-13 relative (1e-300 absolute floor)", () => {
    let worstRel = 0;
    for (const { x, df, p } of tCases) {
      const got = tCdf(x, df);
      const denom = Math.max(Math.abs(p), 1e-300);
      const rel = Math.abs(got - p) / denom;
      if (rel > worstRel) worstRel = rel;
      // 1e-13 holds through df=99 (worst there ~2.7e-14, tiny tails included).
      // At df=299 the incomplete-beta normalizer exp(lgamma(a+b) - lgamma(a) -
      // lgamma(b) + ...) is limited by lgamma's ~15-digit precision at args near
      // 150, so those cases need ~2e-13. Relaxation is confined to large df.
      const tol = df >= 200 ? 2e-13 : 1e-13;
      expect(rel).toBeLessThan(tol);
    }
    // Achieved worst relative error across all 60 cases (see comment above).
    // Deterministic (pure IEEE-754); df<=29 sit at ~5e-15.
    expect(worstRel).toBeLessThan(2e-13);
  });
});
