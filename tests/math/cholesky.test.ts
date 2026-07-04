import { describe, it, expect } from "bun:test";
import { cholesky, logDetFromChol, cholInverse } from "../../src/math/cholesky.ts";

// R references (options(digits=17)):
//   A <- matrix(c(4,2,0.6,1, 2,3,0.4,0.8, 0.6,0.4,2,0.5, 1,0.8,0.5,1.5), 4, 4)
//   t(chol(A)); determinant(A, logarithm=TRUE)$modulus; chol2inv(chol(A))
const A = [
  [4, 2, 0.6, 1],
  [2, 3, 0.4, 0.8],
  [0.6, 0.4, 2, 0.5],
  [1, 0.8, 0.5, 1.5],
];

const L_R = [
  [2, 0, 0, 0],
  [1, 1.414213562373095, 0, 0],
  [0.3, 0.07071067811865477, 1.380217374184226, 0],
  [0.5, 0.2121320343559643, 0.2427153912607432, 1.070555574851275],
];

const AINV_R = [
  [0.4036321165208629, -0.2278660742912105, -0.04213804790912837, -0.1335134887555535],
  [-0.2278660742912105, 0.5187102093161727, -0.004580222598818306, -0.1232079879082123],
  [-0.04213804790912837, -0.004580222598818306, 0.5519168231576055, -0.1534374570604131],
  [-0.1335134887555535, -0.1232079879082123, -0.1534374570604131, 0.8725324050748867],
];

describe("cholesky", () => {
  it("computes the lower-triangular factor matching R t(chol(A))", () => {
    const L = cholesky(A);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        expect(L[i]![j]!).toBeCloseTo(L_R[i]![j]!, 12);
      }
    }
  });

  it("throws on a non-positive-definite matrix", () => {
    // singular: row3 = row1 + row2
    const bad = [
      [1, 2, 3],
      [2, 5, 7],
      [3, 7, 10],
    ];
    expect(() => cholesky(bad)).toThrow(/positive definite/i);
    // negative-definite corner
    expect(() => cholesky([[-1]])).toThrow(/positive definite/i);
  });
});

describe("logDetFromChol", () => {
  it("matches R determinant(A, logarithm=TRUE)", () => {
    expect(logDetFromChol(cholesky(A))).toBeCloseTo(2.86027903536677, 12);
  });
});

describe("cholInverse", () => {
  it("matches R chol2inv(chol(A))", () => {
    const inv = cholInverse(A);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        expect(inv[i]![j]!).toBeCloseTo(AINV_R[i]![j]!, 12);
      }
    }
  });
});
