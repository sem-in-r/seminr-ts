import { describe, it, expect } from "bun:test";
import * as math from "../../src/math/index.ts";
import type {
  Matrix,
  NamedMatrix,
  EigenSym,
  Standardized,
  CenteredColumns,
  BfgsOptions,
  BfgsResult,
} from "../../src/math/index.ts";

/**
 * Contract test for the `@seminr/core/math` subpath.
 *
 * The list below was originally the record of what the subpath exported before
 * the `@compstats/core` delegation began (captured from `src/math/index.ts` at
 * cf73535, v0.2.1), guarding the six names `seminrExtras-ts` reached for. That
 * job is finished: extras migrated off the subpath entirely, and **0.5.0 retired
 * the nine names that existed only for it** — `tCdf`, `lgamma`, `lowerRegGamma`,
 * `incompleteBeta`, `jacobiEigenSym`, `quantile`, `solve`, `colCor`, `colCov`.
 * All nine have an R-pinned counterpart in `@compstats/core`; only `tCdf` had no
 * internal caller and so lost its implementation as well as its export.
 *
 * `jacobiEigenSym` is the one to be careful with. It is called *inside* `math/`
 * by `symMatrixPower` (`src/math/eigen.ts`), which `src/cbsem/tenBerge.ts` uses,
 * and ours clamps near-zero eigenvalues where `@compstats/core`'s
 * `eigenSymmetric` does not. Only the export went; the implementation stays.
 *
 * The list's job now is the one it always did second: pin the surface so an
 * accidental `export *` cannot widen it, and so a drop is caught here rather
 * than by whoever imports the subpath next.
 */
const EXPORTS = [
  // matrix.ts
  "zeros",
  "matmul",
  "transpose",
  "namedMatrix",
  "nmGet",
  "nmSet",
  // solve.ts
  "inverse",
  "ols",
  "olsColumns",
  // eigen.ts
  "symMatrixPower",
  // cholesky.ts
  "cholesky",
  "logDetFromChol",
  "cholInverse",
  // distributions.ts
  "normalCdf",
  "chisqCdf",
  "noncentralChisqCdf",
  "chisqUpperTail",
  "noncentralChisqUpperTail",
  // stats.ts
  "mean",
  "colMean",
  "sd",
  "standardize",
  "standardizeInPlace",
  "cov",
  "cor",
  "centerColumns",
  "corFromCentered",
  // optimize.ts
  "bfgs",
] as const;

/**
 * Retired in 0.5.0. Asserted **absent** rather than merely dropped from the list
 * above, because "we removed it" and "it is gone from the built surface" are
 * different claims and only the second one is what a consumer sees.
 */
const RETIRED = [
  "quantile",
  "tCdf",
  "solve",
  "colCor",
  "colCov",
  "jacobiEigenSym",
  "lgamma",
  "lowerRegGamma",
  "incompleteBeta",
] as const;

describe("@seminr/core/math facade", () => {
  it("exports every documented name as a callable function", () => {
    const missing = EXPORTS.filter((name) => !(name in math));
    expect(missing).toEqual([]);
    const notFunctions = EXPORTS.filter(
      (name) => typeof (math as Record<string, unknown>)[name] !== "function",
    );
    expect(notFunctions).toEqual([]);
  });

  it("exports nothing beyond the documented list", () => {
    // Guards against an accidental `export *` widening the public surface.
    const extra = Object.keys(math).filter((k) => !(EXPORTS as readonly string[]).includes(k));
    expect(extra.sort()).toEqual([]);
  });

  it("no longer exports the names retired in 0.5.0", () => {
    const surviving = RETIRED.filter((name) => name in math);
    expect(surviving).toEqual([]);
  });

  it("keeps every export working through the subpath, not just importable", () => {
    const a: Matrix = [
      [4, 2, 1],
      [2, 3, 0.5],
      [1, 0.5, 2],
    ];
    const x = [
      [1, 2],
      [2, 1],
      [3, 5],
      [4, 3],
    ];
    const y = [1, 2, 3, 4];

    // matrix
    expect(math.zeros(2, 3)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(math.matmul([[1, 2]], [[3], [4]])).toEqual([[11]]);
    expect(math.transpose([[1, 2]])).toEqual([[1], [2]]);
    const named: NamedMatrix = math.namedMatrix(["r1"], ["c1"]);
    math.nmSet(named, "r1", "c1", 7);
    expect(math.nmGet(named, "r1", "c1")).toBe(7);

    // solve / eigen / cholesky
    expect(math.inverse(a).length).toBe(3);
    expect(math.ols(x, y).length).toBe(2);
    expect(math.olsColumns(math.transpose(x), y).length).toBe(2);
    expect(math.symMatrixPower(a, 0.5).length).toBe(3);
    expect(math.cholesky(a).length).toBe(3);
    expect(Number.isFinite(math.logDetFromChol(math.cholesky(a)))).toBe(true);
    expect(math.cholInverse(a).length).toBe(3);

    // distributions
    expect(math.normalCdf(0)).toBeCloseTo(0.5, 12);
    expect(math.chisqCdf(1, 1)).toBeGreaterThan(0);
    expect(math.noncentralChisqCdf(1, 1, 0.5)).toBeGreaterThan(0);
    // The upper tail is its own calculation, not `1 - lower`: in the far tail
    // the subtraction has no digits left to give.
    expect(math.chisqUpperTail(1000, 300)).toBeGreaterThan(0);
    expect(1 - math.chisqCdf(1000, 300)).toBe(0);
    expect(math.noncentralChisqUpperTail(1, 1, 0.5)).toBeGreaterThan(0);

    // stats
    expect(math.mean(y)).toBe(2.5);
    expect(math.colMean(y)).toBe(2.5);
    expect(math.sd(y)).toBeGreaterThan(0);
    const std: Standardized = math.standardize(x);
    expect(std.values.length).toBe(4);
    const inPlace = x.map((r) => [...r]);
    math.standardizeInPlace(inPlace);
    expect(inPlace.length).toBe(4);
    expect(Number.isFinite(math.cov(y, y))).toBe(true);
    expect(math.cor(y, y)).toBeCloseTo(1, 12);
    const centered: CenteredColumns = math.centerColumns(x);
    expect(math.corFromCentered(centered, centered).length).toBe(2);

    // optimize
    const options: BfgsOptions = {
      fn: (p) => (p[0]! - 3) ** 2 + (p[1]! + 1) ** 2,
      grad: (p) => [2 * (p[0]! - 3), 2 * (p[1]! + 1)],
      x0: [0, 0],
    };
    const fit: BfgsResult = math.bfgs(options);
    expect(fit.x[0]).toBeCloseTo(3, 6);
    expect(fit.x[1]).toBeCloseTo(-1, 6);
    expect(fit.converged).toBe(true);
  });
});
