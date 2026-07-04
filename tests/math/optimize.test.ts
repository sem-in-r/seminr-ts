import { describe, it, expect } from "bun:test";
import { bfgs } from "../../src/math/optimize.ts";

describe("bfgs", () => {
  it("minimizes a convex quadratic exactly", () => {
    // f(x) = (x0-1)^2 + 2*(x1+0.5)^2, minimum at (1, -0.5)
    const fn = (x: number[]) => (x[0]! - 1) ** 2 + 2 * (x[1]! + 0.5) ** 2;
    const grad = (x: number[]) => [2 * (x[0]! - 1), 4 * (x[1]! + 0.5)];
    const res = bfgs({ fn, grad, x0: [0, 0] });
    expect(res.converged).toBe(true);
    expect(res.x[0]!).toBeCloseTo(1, 8);
    expect(res.x[1]!).toBeCloseTo(-0.5, 8);
    expect(res.fx).toBeCloseTo(0, 12);
  });

  it("minimizes the Rosenbrock function from a standard start", () => {
    // f = (1-x)^2 + 100(y-x^2)^2, minimum at (1,1) with f=0
    const fn = (v: number[]) => (1 - v[0]!) ** 2 + 100 * (v[1]! - v[0]! ** 2) ** 2;
    const grad = (v: number[]) => [
      -2 * (1 - v[0]!) - 400 * v[0]! * (v[1]! - v[0]! ** 2),
      200 * (v[1]! - v[0]! ** 2),
    ];
    const res = bfgs({ fn, grad, x0: [-1.2, 1] });
    expect(res.converged).toBe(true);
    expect(res.x[0]!).toBeCloseTo(1, 6);
    expect(res.x[1]!).toBeCloseTo(1, 6);
  });

  it("respects maxIter and reports non-convergence", () => {
    const fn = (v: number[]) => (1 - v[0]!) ** 2 + 100 * (v[1]! - v[0]! ** 2) ** 2;
    const grad = (v: number[]) => [
      -2 * (1 - v[0]!) - 400 * v[0]! * (v[1]! - v[0]! ** 2),
      200 * (v[1]! - v[0]! ** 2),
    ];
    const res = bfgs({ fn, grad, x0: [-1.2, 1], maxIter: 2 });
    expect(res.converged).toBe(false);
    expect(res.iterations).toBeLessThanOrEqual(2);
  });

  it("stays exactly at a stationary start (zero gradient)", () => {
    const fn = (x: number[]) => x[0]! ** 2;
    const grad = (x: number[]) => [2 * x[0]!];
    const res = bfgs({ fn, grad, x0: [0] });
    expect(res.converged).toBe(true);
    expect(res.x[0]!).toBe(0);
    expect(res.iterations).toBe(0);
  });
});
