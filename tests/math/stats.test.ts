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
