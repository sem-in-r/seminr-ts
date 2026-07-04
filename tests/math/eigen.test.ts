import { describe, it, expect } from "bun:test";
import { jacobiEigenSym, symMatrixPower } from "../../src/math/eigen.ts";
import { matmul } from "../../src/math/matrix.ts";

// R references (options(digits=17)):
//   A as in cholesky.test.ts; eigen(A, symmetric=TRUE)$values
//   "%^%" <- function(S, p) with(eigen(S, symmetric=TRUE), vectors %*% (values^p * t(vectors)))
const A = [
  [4, 2, 0.6, 1],
  [2, 3, 0.4, 0.8],
  [0.6, 0.4, 2, 0.5],
  [1, 0.8, 0.5, 1.5],
];

const EIGENVALUES_R = [6.100102513528688, 1.931311060608162, 1.436564615551495, 1.032021810311653];

const A_POW_NEG_HALF_R = [
  [0.5980851160278977, -0.1843180520208385, -0.04090383000843328, -0.1013905463869483],
  [-0.1843180520208385, 0.6903643097213333, -0.01449500826533455, -0.08901729951976395],
  [-0.04090383000843328, -0.01449500826533455, 0.7354011316452801, -0.09601442682470332],
  [-0.1013905463869482, -0.08901729951976395, -0.09601442682470333, 0.9192983805087305],
];

const A_POW_HALF_R = [
  [1.897771515677905, 0.5457421068803481, 0.1526209155980627, 0.2780929398265879],
  [0.5457421068803481, 1.625444982200376, 0.09205622638547871, 0.2271999423439146],
  [0.1526209155980628, 0.09205622638547875, 1.392454748567014, 0.1711790889648841],
  [0.2780929398265879, 0.2271999423439146, 0.1711790889648841, 1.158335971347985],
];

describe("jacobiEigenSym", () => {
  it("computes eigenvalues in descending order matching R eigen()", () => {
    const { values } = jacobiEigenSym(A);
    expect(values.length).toBe(4);
    for (let i = 0; i < 4; i++) expect(values[i]!).toBeCloseTo(EIGENVALUES_R[i]!, 11);
  });

  it("returns eigenvectors satisfying A v = lambda v (columns of V)", () => {
    const { values, vectors } = jacobiEigenSym(A);
    const av = matmul(A, vectors);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        expect(av[i]![j]!).toBeCloseTo(values[j]! * vectors[i]![j]!, 10);
      }
    }
  });

  it("reconstructs A = V diag(values) V^T", () => {
    const { values, vectors } = jacobiEigenSym(A);
    // V diag(values)
    const vd = vectors.map((row) => row.map((v, j) => v * values[j]!));
    const vt = vectors[0]!.map((_, j) => vectors.map((row) => row[j]!));
    const rec = matmul(vd, vt);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) expect(rec[i]![j]!).toBeCloseTo(A[i]![j]!, 10);
    }
  });
});

describe("symMatrixPower", () => {
  it("matches R A %^% -0.5", () => {
    const p = symMatrixPower(A, -0.5);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) expect(p[i]![j]!).toBeCloseTo(A_POW_NEG_HALF_R[i]![j]!, 11);
    }
  });

  it("matches R A %^% 0.5", () => {
    const p = symMatrixPower(A, 0.5);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) expect(p[i]![j]!).toBeCloseTo(A_POW_HALF_R[i]![j]!, 11);
    }
  });
});
