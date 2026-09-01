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
 * `src/math/` is public API since 0.2.0 and has a second consumer:
 * `seminrExtras-ts` imports `quantile`, `tCdf`, `solve`, `colCor`, `colCov`
 * (src/) and `jacobiEigenSym` (demos/) from it. Plan 010 replaces several of
 * these implementations with delegations to `@compstats/core`; this list is the
 * hard-coded record of what the subpath exported before that work started, so
 * any swap that drops or renames a name fails here rather than downstream.
 *
 * Captured from `src/math/index.ts` at cf73535 (v0.2.1).
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
  "solve",
  "inverse",
  "ols",
  "olsColumns",
  // eigen.ts
  "jacobiEigenSym",
  "symMatrixPower",
  // cholesky.ts
  "cholesky",
  "logDetFromChol",
  "cholInverse",
  // distributions.ts
  "lgamma",
  "lowerRegGamma",
  "incompleteBeta",
  "tCdf",
  "normalCdf",
  "chisqCdf",
  "noncentralChisqCdf",
  "chisqUpperTail",
  "noncentralChisqUpperTail",
  // stats.ts
  "mean",
  "sd",
  "standardize",
  "standardizeInPlace",
  "cov",
  "cor",
  "colCov",
  "colCor",
  "centerColumns",
  "corFromCentered",
  "quantile",
  // optimize.ts
  "bfgs",
] as const;

/** The six `seminrExtras-ts` reaches for — called out so a break is legible. */
const EXTRAS_DEPENDENCIES = [
  "quantile",
  "tCdf",
  "solve",
  "colCor",
  "colCov",
  "jacobiEigenSym",
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

  it("keeps the names seminrExtras-ts imports", () => {
    for (const name of EXTRAS_DEPENDENCIES) {
      expect(typeof (math as Record<string, unknown>)[name]).toBe("function");
    }
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
    expect(math.solve(a, [1, 0, 0]).length).toBe(3);
    expect(math.inverse(a).length).toBe(3);
    expect(math.ols(x, y).length).toBe(2);
    expect(math.olsColumns(math.transpose(x), y).length).toBe(2);
    const eig: EigenSym = math.jacobiEigenSym(a);
    expect(eig.values.length).toBe(3);
    expect(math.symMatrixPower(a, 0.5).length).toBe(3);
    expect(math.cholesky(a).length).toBe(3);
    expect(Number.isFinite(math.logDetFromChol(math.cholesky(a)))).toBe(true);
    expect(math.cholInverse(a).length).toBe(3);

    // distributions
    expect(Number.isFinite(math.lgamma(4.5))).toBe(true);
    expect(math.lowerRegGamma(2, 1)).toBeGreaterThan(0);
    expect(math.incompleteBeta(0.5, 2, 3)).toBeGreaterThan(0);
    expect(math.tCdf(0, 10)).toBeCloseTo(0.5, 12);
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
    expect(math.sd(y)).toBeGreaterThan(0);
    const std: Standardized = math.standardize(x);
    expect(std.values.length).toBe(4);
    const inPlace = x.map((r) => [...r]);
    math.standardizeInPlace(inPlace);
    expect(inPlace.length).toBe(4);
    expect(Number.isFinite(math.cov(y, y))).toBe(true);
    expect(math.cor(y, y)).toBeCloseTo(1, 12);
    expect(math.colCov(x, x).length).toBe(2);
    expect(math.colCor(x, x).length).toBe(2);
    const centered: CenteredColumns = math.centerColumns(x);
    expect(math.corFromCentered(centered, centered).length).toBe(2);
    expect(math.quantile(y, 0.5)).toBe(2.5);

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
