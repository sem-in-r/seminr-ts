import { describe, it, expect } from "bun:test";
import { mean, sd, standardize, cov, cor, colCov, colCor, quantile } from "../../src/math/stats.ts";

describe("mean", () => {
  it("returns the arithmetic mean", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns the single value for a length-1 array", () => {
    expect(mean([7])).toBe(7);
  });
});

describe("sd", () => {
  it("uses the sample (n-1) denominator like R", () => {
    // R: sd(c(1,2,3,4)) == 1.2909944487358056
    expect(sd([1, 2, 3, 4])).toBeCloseTo(1.2909944487358056, 12);
  });

  it("returns 0 for a constant vector", () => {
    expect(sd([5, 5, 5])).toBe(0);
  });
});

describe("standardize", () => {
  it("z-scores each column and returns means and sds", () => {
    const result = standardize([
      [1, 10],
      [2, 20],
      [3, 30],
    ]);
    expect(result.values).toEqual([
      [-1, -1],
      [0, 0],
      [1, 1],
    ]);
    expect(result.means).toEqual([2, 20]);
    expect(result.sds).toEqual([1, 10]);
  });

  it("throws on a zero-variance column, naming it when column names are given", () => {
    expect(() =>
      standardize(
        [
          [1, 5],
          [2, 5],
        ],
        ["a", "b"],
      ),
    ).toThrow(/b/);
  });
});

// R references: x <- c(1,2,4,7); y <- c(2,1,5,6)
const X = [1, 2, 4, 7];
const Y = [2, 1, 5, 6];
// m <- cbind(a=x, b=y, c=c(1,1,2,3)) as rows
const M = [
  [1, 2, 1],
  [2, 1, 1],
  [4, 5, 2],
  [7, 6, 3],
];

describe("cov / cor", () => {
  it("computes sample covariance (n-1) like R's cov()", () => {
    expect(cov(X, Y)).toBeCloseTo(5.666666666666667, 12);
  });

  it("computes Pearson correlation like R's cor()", () => {
    expect(cor(X, Y)).toBeCloseTo(0.899735410842437, 12);
  });
});

describe("colCov / colCor", () => {
  it("computes the column-covariance matrix of two matrices like R's cov(m, m)", () => {
    const c = colCov(M, M);
    expect(c[0]![0]).toBeCloseTo(7, 12);
    expect(c[0]![1]).toBeCloseTo(5.666666666666667, 12);
    expect(c[1]![2]).toBeCloseTo(2.1666666666666665, 12);
    expect(c[2]![2]).toBeCloseTo(0.9166666666666666, 12);
  });

  it("computes the column-correlation matrix like R's cor(m, m)", () => {
    const c = colCor(M, M);
    expect(c[0]![0]).toBeCloseTo(1, 12);
    expect(c[0]![2]).toBeCloseTo(0.9869275424396534, 12);
    expect(c[1]![2]).toBeCloseTo(0.9506541513652698, 12);
  });

  it("supports rectangular cross-covariance (items x constructs shape)", () => {
    const scores = M.map((r) => [r[2]!]);
    const c = colCov(M, scores);
    expect(c.length).toBe(3);
    expect(c[0]!.length).toBe(1);
    expect(c[1]![0]).toBeCloseTo(2.1666666666666665, 12);
  });
});

describe("quantile (R type-7)", () => {
  const v = [3, 1, 4, 1, 5, 9, 2, 6];

  it("matches R's default quantile() at 0.25", () => {
    expect(quantile(v, 0.25)).toBeCloseTo(1.75, 12);
  });

  it("matches R at the median", () => {
    expect(quantile(v, 0.5)).toBeCloseTo(3.5, 12);
  });

  it("matches R at 0.975", () => {
    expect(quantile(v, 0.975)).toBeCloseTo(8.475000000000001, 12);
  });

  it("returns min at p=0 and max at p=1", () => {
    expect(quantile(v, 0)).toBe(1);
    expect(quantile(v, 1)).toBe(9);
  });
});

/**
 * The `@compstats/core` delegation of `mean`, `sd` and `quantile` (plan 010,
 * slice 1e), pinned on a bootstrap-shaped sample rather than a toy array: 500
 * replicates drawn through this package's own `mulberry32(20260901)` and shaped
 * like a path coefficient, which is what `bootPercentileCIs` and
 * `summarizePlsBoot` actually feed these three.
 *
 * `mean` and `sd` are asserted **exactly**, with `Object.is`, against the loops
 * they replaced. `quantile` is not — that swap deliberately moves the last bit,
 * and R decides where it should land.
 */
describe("delegated summaries on a bootstrap-shaped sample", () => {
  const N = 500;
  const sample: number[] = (() => {
    // mulberry32, inlined so this file does not depend on the bootstrap module.
    let a = 20260901 >>> 0;
    const rng = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      const u1 = Math.max(rng(), 1e-12);
      const u2 = rng();
      out.push(0.42 + 0.085 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
    }
    return out;
  })();

  /** The retired `mean`: a left fold from 0, then one division. */
  const legacyMean = (x: readonly number[]): number => {
    let s = 0;
    for (const v of x) s += v;
    return s / x.length;
  };

  /** The retired `sd`: centered squares, folded from 0, n−1 denominator. */
  const legacySd = (x: readonly number[]): number => {
    const m = legacyMean(x);
    let ss = 0;
    for (const v of x) ss += (v - m) * (v - m);
    return Math.sqrt(ss / (x.length - 1));
  };

  /** The retired `quantile`: type 7 written as `low + h * (high - low)`. */
  const legacyQuantile = (x: readonly number[], p: number): number => {
    const sorted = [...x].sort((a, b) => a - b);
    const h = (sorted.length - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
  };

  it("computes mean bit-identically to the loop it replaced", () => {
    // Both fold from 0 in the same order, so this is exact, not close.
    expect(Object.is(mean(sample), legacyMean(sample))).toBe(true);
    // R agrees to 15 digits but not to the bit — R's `mean` makes a second pass
    // over the residuals to refine the sum, which neither implementation does.
    // That gap predates this delegation and is unchanged by it.
    expect(mean(sample)).toBeCloseTo(4.25388033916636099e-1, 15);
  });

  it("computes sd bit-identically to the loop it replaced", () => {
    expect(Object.is(sd(sample), legacySd(sample))).toBe(true);
    // R: sd(x) — 1 ulp away, for the same reason as `mean` above.
    expect(sd(sample)).toBeCloseTo(8.75563367220183603e-2, 15);
  });

  it("matches R at every bootstrap probability, to the bit at six of seven", () => {
    // R: quantile(x, p, type = 7), options(digits = 17). R's type-7 rule is
    // `(1 - h) * low + h * high`, which is now the expression evaluated here,
    // so most of these land on R's exact double. p = 0.025 is one ulp out —
    // R evaluates the same expression through its own vectorized C path, and
    // that much last-bit noise survives. The retired expression was one ulp out
    // at the same probability, so nothing regressed here.
    const R: [number, number][] = [
      [0.025, 2.52839510045765770e-1],
      [0.05, 2.74370487119763029e-1],
      [0.25, 3.63563087099769311e-1],
      [0.5, 4.27923508256104146e-1],
      [0.75, 4.88551708645892480e-1],
      [0.95, 5.66733361581094552e-1],
      [0.975, 5.85647735743420439e-1],
    ];
    let exact = 0;
    for (const [p, expected] of R) {
      if (Object.is(quantile(sample, p), expected)) exact++;
      expect(Math.abs(quantile(sample, p) - expected)).toBeLessThanOrEqual(
        Number.EPSILON * expected,
      );
    }
    expect(exact).toBe(6);
  });

  it("differs from the retired quantile, and never by more than one ulp", () => {
    // The whole reason this swap is not bit-identical. `low + h * (high - low)`
    // and `(1 - h) * low + h * high` are the same quantity in exact arithmetic
    // and round differently in doubles, which is why the bootstrap percentile
    // CIs in benchmark/equivalence.ts move. R writes it the second way, so the
    // second way is the one to keep.
    //
    // The seven probabilities above happen to agree on this sample, which is
    // why the sweep is over all 999 — 227 of them differ. A test that only
    // probed the round numbers would have reported "no change" and been wrong.
    let moved = 0;
    for (let i = 1; i < 1000; i++) {
      const p = i / 1000;
      const now = quantile(sample, p);
      const before = legacyQuantile(sample, p);
      if (Object.is(now, before)) continue;
      moved++;
      expect(Math.abs(now - before)).toBeLessThanOrEqual(Number.EPSILON * Math.abs(now));
    }
    expect(moved).toBe(227);
  });

  it("takes R's side of that difference", () => {
    // Spot-checked at five probabilities where the two expressions disagree.
    // R: quantile(x, p, type = 7), options(digits = 17).
    const R: [number, number][] = [
      [0.001, 2.07671726334950513e-1],
      [0.007, 2.34040525698613194e-1],
      [0.01, 2.38972522082736588e-1],
      [0.012, 2.39897674123855570e-1],
      [0.021, 2.49460769379650726e-1],
    ];
    let closer = 0;
    for (const [p, expected] of R) {
      const now = Math.abs(quantile(sample, p) - expected);
      const before = Math.abs(legacyQuantile(sample, p) - expected);
      if (now < before) closer++;
      // Neither is ever more than an ulp out; the question is only which lands
      // on R's double. The delegation does on four of the five, the retired
      // expression on one — R's own evaluation order leaves that much noise.
      expect(now).toBeLessThanOrEqual(Number.EPSILON * expected);
    }
    expect(closer).toBe(4);
  });

  it("keeps R's guard against interpolating between equal order statistics", () => {
    // R's type 7 only interpolates when `index > lo && x[hi] != qs`; a knot
    // probability and a tied pair must return the order statistic itself.
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([2, 2, 2, 2], 0.5)).toBe(2);
    expect(quantile([1, 2, 3], 0)).toBe(1);
    expect(quantile([1, 2, 3], 1)).toBe(3);
  });
});
