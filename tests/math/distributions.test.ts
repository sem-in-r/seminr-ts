import { describe, it, expect } from "bun:test";
import { normalCdf, chisqCdf, noncentralChisqCdf } from "../../src/math/distributions.ts";

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
