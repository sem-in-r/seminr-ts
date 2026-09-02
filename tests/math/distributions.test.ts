import { describe, it, expect } from "bun:test";
import {
  normalCdf,
  chisqCdf,
  noncentralChisqCdf,
  chisqUpperTail,
  noncentralChisqUpperTail,
  incompleteBeta,
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

/**
 * The upper tail, as its own path.
 *
 * `fitMeasures.ts` forms every chi-square p-value as a right-tail probability,
 * and formed them as `1 - lower` until plan 011. That is not the same
 * calculation: R's `pchisq(..., lower.tail = FALSE)` differs from `1 - lower`
 * at 31 of 64 grid points in the RMSEA regime, and routing through it improves
 * the median error against R by 5× (5.08e-14 → 1.06e-14, measured in plan 010,
 * task 1c). The subtraction cannot do better, because a lower tail sitting just
 * below 1 carries absolute error that the subtraction then divides by a
 * probability as small as 1e-10.
 *
 * R 4.5.3, `options(digits = 17)`:
 *   pchisq(x, df, lower.tail = FALSE)
 *   pchisq(x, df, ncp, lower.tail = FALSE)
 */
describe("upper-tail chi-square", () => {
  const CENTRAL: Array<[number, number, number]> = [
    [50, 24, 0.0014159729740810284],
    [120.5, 60, 6.020534454629625e-6],
    [200, 100, 1.178450072097942e-8],
    [3.2, 7, 0.86590474173609833],
    [1000, 300, 3.7293204855680015e-76],
  ];
  const NONCENTRAL: Array<[number, number, number, number]> = [
    [50, 24, 10, 0.056327893588483939],
    [120.5, 60, 40, 0.11397045946939006],
    [200, 100, 150, 0.96769436075167603],
    [63.6, 24, 74.2, 0.97875185425528188],
    [1000, 300, 500, 0.00011050920423794075],
  ];

  it("matches R's pchisq(lower.tail = FALSE), central", () => {
    for (const [x, df, expected] of CENTRAL) {
      expect(Math.abs(chisqUpperTail(x, df) / expected - 1)).toBeLessThan(1e-12);
    }
  });

  it("matches R's pchisq(lower.tail = FALSE), noncentral", () => {
    for (const [x, df, ncp, expected] of NONCENTRAL) {
      expect(Math.abs(noncentralChisqUpperTail(x, df, ncp) / expected - 1)).toBeLessThan(1e-12);
    }
  });

  it("pins the ECSI chi-square p-value the distributions docstring quotes", () => {
    // The docstring in src/math/distributions.ts states this number as the
    // concrete effect of the upper-tail change. It shipped once stating a value
    // computed at *our* chi-square beside R's computed at *lavaan's* — two
    // different inputs presented as one comparison. Pinned here so the quoted
    // figure is like-for-like and cannot drift again.
    //
    // R 4.5.3: pchisq(484.921572960681, 178, lower.tail = FALSE)
    const R = 2.98554436658718868e-30;
    const ours = chisqUpperTail(484.921572960681, 178);
    expect(ours).toBe(2.98554436658730989e-30);
    expect(Math.abs(ours / R - 1)).toBeLessThan(5e-14);

    // R prints these at options(digits = 17); JavaScript prints the shortest
    // round-tripping spelling, which is what a reader running the function sees
    // and what the docstring therefore quotes. The two spellings are the same
    // double in each case. These assertions look tautological and are not —
    // they are the ones a reader confused by the mismatch will actually run.
    expect(2.98554436658730989e-30).toBe(2.98554436658731e-30);
    expect(2.98554436658718868e-30).toBe(2.9855443665871887e-30);
    expect(String(ours)).toBe("2.98554436658731e-30");
    // And the point of the exercise: the subtraction has nothing to offer here.
    expect(1 - chisqCdf(484.921572960681, 178)).toBe(0);
  });

  it("beats `1 - lower` where the subtraction cannot help", () => {
    // The far right tail, where 1 - lower loses every digit it has: the lower
    // tail is 1 to the last bit, so the subtraction returns exactly 0 while the
    // true probability is 3.7e-76.
    expect(1 - chisqCdf(1000, 300)).toBe(0);
    expect(chisqUpperTail(1000, 300)).toBeGreaterThan(0);
  });
});
