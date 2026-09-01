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

/**
 * A rank-deficient Gram matrix: `b` spans two dimensions in three columns, so
 * `b' b` has one structurally zero eigenvalue whose computed *sign* is a
 * rounding artefact. This is the shape the C5 higher-order CBSEM model makes in
 * `src/cbsem/tenBerge.ts` — `ImageSat` is a second-order factor over exactly
 * `Image` and `Satisfaction`, so its five latent loading columns span four
 * dimensions — and it is the shape that turned three separate perturbations
 * during plan 010 into NaN factor scores.
 */
const RANK_DEFICIENT = (() => {
  const b = [
    [1, 0, 1],
    [0, 1, 1],
    [2, 1, 3],
    [1, 3, 4],
    [0.5, 0.25, 0.75],
  ];
  // b' b, symmetric and exactly singular in exact arithmetic.
  return Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => b.reduce((s, row) => s + row[i]! * row[j]!, 0)),
  );
})();

describe("symMatrixPower on a structurally singular matrix", () => {
  it("treats a numerically zero eigenvalue as zero, whichever side of zero it lands", () => {
    const { values } = jacobiEigenSym(RANK_DEFICIENT);
    const smallest = values[values.length - 1]!;
    // The premise: the third eigenvalue is rounding noise, not a number.
    expect(Math.abs(smallest)).toBeLessThan(1e-12);

    const p = symMatrixPower(RANK_DEFICIENT, -0.5);
    for (const row of p) for (const v of row) expect(Number.isFinite(v)).toBe(true);
  });

  it("gives the same answer whether the artefact rounds positive or negative", () => {
    // The sharp edge, stated directly. A diagonal matrix carries its
    // eigenvalues exactly, so these two differ only in the sign of an artefact
    // no model can distinguish — and before this fix the second was NaN
    // throughout while the first carried a spurious 1e8.
    const positive = symMatrixPower(
      [
        [4, 0, 0],
        [0, 1, 0],
        [0, 0, 1e-16],
      ],
      -0.5,
    );
    const negative = symMatrixPower(
      [
        [4, 0, 0],
        [0, 1, 0],
        [0, 0, -1e-16],
      ],
      -0.5,
    );
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(Number.isFinite(negative[i]![j]!)).toBe(true);
        expect(negative[i]![j]!).toBe(positive[i]![j]!);
      }
    }
    // Dropped, not inverted: the null direction contributes nothing.
    expect(positive[2]![2]!).toBe(0);
    // The directions that are real are untouched.
    expect(positive[0]![0]!).toBe(0.5);
    expect(positive[1]![1]!).toBe(1);
  });

  it("is the Moore-Penrose pseudo-inverse square root: P A P = P", () => {
    // With the null direction dropped, `A^-0.5 A A^-0.5` is the projector onto
    // the range, which is idempotent. A NaN or a 1e8 artefact fails this.
    const half = symMatrixPower(RANK_DEFICIENT, -0.5);
    const proj = matmul(matmul(half, RANK_DEFICIENT), half);
    const sq = matmul(proj, proj);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) expect(sq[i]![j]!).toBeCloseTo(proj[i]![j]!, 10);
    }
  });

  it("still raises a genuinely negative eigenvalue to a NaN, not to zero", () => {
    // Indefiniteness is a modelling error and must stay visible; only rounding
    // noise at the zero threshold is absorbed.
    const indefinite = [
      [1, 0],
      [0, -2],
    ];
    const p = symMatrixPower(indefinite, 0.5);
    expect(p.some((row) => row.some((v) => Number.isNaN(v)))).toBe(true);
  });
});
