import { describe, it, expect } from "bun:test";
import { bfgs } from "../../src/math/optimize.ts";

/**
 * `bfgs` runs R's `vmmin` — R Core's arrangement of Nash (1990) algorithm 21,
 * the routine behind `optim(method = "BFGS")` — by way of
 * `@compstats/core/stats`'s `optim`. So these assertions are against **R's own
 * output**, captured at `options(digits = 17)` on R 4.5.3, and not against what
 * this package produced yesterday.
 *
 * The counts are the strongest check available and the reason they are pinned:
 * two integers cannot agree by luck the way a converged `par` can. A port that
 * misplaces one step reduction or one Hessian reset lands on the same optimum
 * and misses them.
 *
 * The R that produced each block:
 *
 *   fn1 <- function(x) (x[1]-1)^2 + 2*(x[2]+0.5)^2
 *   gr1 <- function(x) c(2*(x[1]-1), 4*(x[2]+0.5))
 *   optim(c(0,0), fn1, gr1, method="BFGS", control=list(reltol=1e-15, maxit=10000))
 *
 *   fn2 <- function(v) (1-v[1])^2 + 100*(v[2]-v[1]^2)^2
 *   gr2 <- function(v) c(-2*(1-v[1]) - 400*v[1]*(v[2]-v[1]^2), 200*(v[2]-v[1]^2))
 *   optim(c(-1.2,1), fn2, gr2, method="BFGS", control=list(reltol=1e-15, maxit=10000))
 *   optim(c(-1.2,1), fn2, gr2, method="BFGS", control=list(maxit=2))
 *   optim(c(-1.2,1), fn2,      method="BFGS", control=list(reltol=1e-15, maxit=10000))
 */

const quadratic = {
  fn: (x: number[]) => (x[0]! - 1) ** 2 + 2 * (x[1]! + 0.5) ** 2,
  grad: (x: number[]) => [2 * (x[0]! - 1), 4 * (x[1]! + 0.5)],
};

const rosenbrock = {
  fn: (v: number[]) => (1 - v[0]!) ** 2 + 100 * (v[1]! - v[0]! ** 2) ** 2,
  grad: (v: number[]) => [
    -2 * (1 - v[0]!) - 400 * v[0]! * (v[1]! - v[0]! ** 2),
    200 * (v[1]! - v[0]! ** 2),
  ],
};

describe("bfgs is R's optim(method = 'BFGS')", () => {
  it("matches R on a convex quadratic, counts included", () => {
    const res = bfgs({ ...quadratic, x0: [0, 0] });
    expect(res.converged).toBe(true);
    expect(res.x).toEqual([1, -0.5]);
    expect(res.fx).toBe(1.2325951644078309e-32);
    expect(res.counts).toEqual({ function: 35, gradient: 26 });
  });

  it("matches R on Rosenbrock from the standard start, counts included", () => {
    const res = bfgs({ ...rosenbrock, x0: [-1.2, 1] });
    expect(res.converged).toBe(true);
    // R's counts exactly: the search took the same steps and the same
    // reductions R's did.
    expect(res.counts).toEqual({ function: 108, gradient: 51 });
    // R lands on 1.0000000000000002 and this on 1.0000000000000004 — the two
    // doubles either side of 1 + 2eps, one ulp apart at the end of 51 gradient
    // evaluations. Both objectives are at the double floor (1.23e-32 against
    // 4.93e-32, which is (1 - x)^2 for those two x). Asserted as R's value plus
    // an ulp rather than rounded away, so a real drift would still show.
    expect(Math.abs(res.x[0]! - 1.0000000000000002)).toBeLessThanOrEqual(2 * Number.EPSILON);
    expect(res.x[1]!).toBe(1);
    expect(res.fx).toBeLessThan(1e-31);
  });

  it("stops at maxIter and reports non-convergence exactly where R does", () => {
    const res = bfgs({ ...rosenbrock, x0: [-1.2, 1], maxIter: 2 });
    expect(res.converged).toBe(false);
    expect(res.x[0]!).toBe(-0.8550399999999998);
    expect(res.x[1]!).toBe(1.1408);
    expect(res.fx).toBe(20.227123078849917);
    expect(res.counts).toEqual({ function: 6, gradient: 2 });
  });

  it("stays exactly at a stationary start, costing R's one call of each", () => {
    const res = bfgs({ fn: (x) => x[0]! ** 2, grad: (x) => [2 * x[0]!], x0: [0] });
    expect(res.converged).toBe(true);
    expect(res.x).toEqual([0]);
    expect(res.fx).toBe(0);
    expect(res.counts).toEqual({ function: 1, gradient: 1 });
    expect(res.iterations).toBe(0);
  });

  it("falls back to R's central finite differences when no gradient is given", () => {
    // R's `ndeps` default is 1e-3, coarse enough to show in the answer: the
    // value lands at 3.8e-8 where the analytic gradient reaches the double
    // floor. R reaches (0.99980443323134438, 0.99960838062338087).
    const res = bfgs({ fn: rosenbrock.fn, x0: [-1.2, 1] });
    expect(res.converged).toBe(true);
    expect(res.x[0]!).toBeCloseTo(0.99980443323134438, 12);
    expect(res.x[1]!).toBeCloseTo(0.99960838062338087, 12);
    // **The one place the counts part company with R**, recorded rather than
    // tolerated: R charges 120 function calls here and this run charges 118,
    // with the gradient count exact. Upstream traces it to a contraction R's
    // compiler applies inside the differencing path that no arrangement they
    // tried reproduced without breaking another case. It is pinned so that a
    // change in the *size* of the gap is a failure, not a shrug.
    expect(res.counts).toEqual({ function: 118, gradient: 38 });
  });

  it("inherits R's defaults for nothing: reltol and maxIter are this package's", () => {
    // R's own defaults are reltol = sqrt(eps) = 1.49e-8 and maxit = 100, and
    // inheriting them silently stops a CBSEM fit short (upstream records a
    // consumer losing 21 iterations and 2.5e-4 of parameter, at convergence: 0).
    // Ours are stated in the docstring and asserted here: a run that inherited
    // R's reltol would stop at R's answer, 1.4777641072367305e-20.
    const res = bfgs({ ...quadratic, x0: [0, 0] });
    expect(res.fx).toBeLessThan(1e-25);
    // The same problem under R's own default, to show the two are different runs.
    const loose = bfgs({ ...quadratic, x0: [0, 0], reltol: Math.sqrt(Number.EPSILON) });
    expect(loose.fx).toBe(1.4777641072367305e-20);
    expect(loose.counts).toEqual({ function: 32, gradient: 15 });
  });

  it("refuses the retired controls rather than ignoring them", () => {
    // `gradTol` and `stallGradTol` were the hand-rolled routine's own stopping
    // rules. `vmmin` stops on `reltol` alone, so accepting them would be a
    // silent behaviour change for a caller that set them deliberately.
    const bad = { ...quadratic, x0: [0, 0], gradTol: 1e-12 } as unknown as Parameters<
      typeof bfgs
    >[0];
    expect(() => bfgs(bad)).toThrow(/gradTol/);
  });
});
