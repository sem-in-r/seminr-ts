import { describe, it, expect } from "bun:test";
import { solve, ols } from "../../src/math/solve.ts";

describe("solve", () => {
  it("solves a 2x2 system", () => {
    // 2x + y = 3; x + 3y = 5  =>  x = 0.8, y = 1.4
    const x = solve(
      [
        [2, 1],
        [1, 3],
      ],
      [3, 5],
    );
    expect(x[0]).toBeCloseTo(0.8, 12);
    expect(x[1]).toBeCloseTo(1.4, 12);
  });

  it("handles a zero pivot via partial pivoting", () => {
    const x = solve(
      [
        [0, 1],
        [1, 0],
      ],
      [2, 3],
    );
    expect(x[0]).toBeCloseTo(3, 12);
    expect(x[1]).toBeCloseTo(2, 12);
  });

  it("solves a near-singular but solvable system accurately", () => {
    // A = [[1, 1], [1, 1+1e-10]], b = [2, 2+1e-10] => x = [1, 1]
    const eps = 1e-10;
    const x = solve(
      [
        [1, 1],
        [1, 1 + eps],
      ],
      [2, 2 + eps],
    );
    expect(x[0]).toBeCloseTo(1, 4);
    expect(x[1]).toBeCloseTo(1, 4);
  });

  it("throws on a singular matrix", () => {
    expect(() =>
      solve(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow(/singular/i);
  });
});

describe("ols", () => {
  it("computes regression coefficients solve(X'X, X'y)", () => {
    // X = [[1,0],[0,1],[1,1]], y = [1,2,3] => beta = [1, 2] (hand-computed)
    const beta = ols(
      [
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      [1, 2, 3],
    );
    expect(beta[0]).toBeCloseTo(1, 12);
    expect(beta[1]).toBeCloseTo(2, 12);
  });
});
