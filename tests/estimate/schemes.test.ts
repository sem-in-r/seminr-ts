import { describe, it, expect } from "bun:test";
import {
  modeA,
  modeB,
  unitWeightsFn,
  constructModeFn,
  pathWeighting,
  pathFactorial,
} from "../../src/estimate/schemes.ts";
import { standardize } from "../../src/math/stats.ts";
import { matmul, namedMatrix, nmGet } from "../../src/math/matrix.ts";
import type { ColumnMatrix } from "../../src/estimate/data.ts";
import { tinyData, tinyMmMatrix, tinySm } from "./tiny.ts";

// Reproduce the state after initialization: normData = scale(data),
// scores = scale(normData %*% unit weights), then one inner-path pass.
const normValues = standardize(tinyData.values, tinyData.columns).values;
const normData: ColumnMatrix = { columns: tinyData.columns, values: normValues };

const initWeights = [
  [1, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 1],
];
const constructNames = ["X", "M", "Y"];
const scores0: ColumnMatrix = {
  columns: constructNames,
  values: standardize(matmul(normValues, initWeights)).values,
};

const pathsMatrix = namedMatrix(constructNames, constructNames, [
  [0, 0, 1],
  [0, 0, 1],
  [0, 0, 0],
]);

describe("inner weighting schemes (R-computed references)", () => {
  it("pathWeighting puts correlations on outgoing cells and OLS betas on incoming cells", () => {
    const inner = pathWeighting(tinySm, scores0, ["Y"], pathsMatrix);
    expect(nmGet(inner, "Y", "X")).toBeCloseTo(0.8948867664472078, 12);
    expect(nmGet(inner, "Y", "M")).toBeCloseTo(0.9412228841496683, 12);
    expect(nmGet(inner, "X", "Y")).toBeCloseTo(0.2996689070217557, 12);
    expect(nmGet(inner, "M", "Y")).toBeCloseTo(0.6782333196260708, 12);
    expect(nmGet(inner, "X", "M")).toBe(0);
  });

  it("pathFactorial uses symmetric correlations", () => {
    const inner = pathFactorial(tinySm, scores0, ["Y"], pathsMatrix);
    expect(nmGet(inner, "X", "Y")).toBeCloseTo(0.8948867664472078, 12);
    expect(nmGet(inner, "Y", "X")).toBeCloseTo(0.8948867664472078, 12);
    expect(nmGet(inner, "M", "Y")).toBeCloseTo(0.9412228841496683, 12);
    expect(nmGet(inner, "X", "M")).toBe(0);
  });
});

describe("outer mode functions (R-computed references)", () => {
  // scores after the first inner-path update, standardized
  const inner = pathWeighting(tinySm, scores0, ["Y"], pathsMatrix);
  const scores1: ColumnMatrix = {
    columns: constructNames,
    values: standardize(matmul(scores0.values, inner.values)).values,
  };

  it("modeA returns item-score covariances", () => {
    const w = modeA(tinyMmMatrix, "X", normData, scores1);
    expect(w[0]).toBeCloseTo(0.9380357664567567, 12);
    expect(w[1]).toBeCloseTo(0.7733150581391607, 12);
  });

  it("modeB returns regression weights solve(cor(items), cor(items, score))", () => {
    const w = modeB(tinyMmMatrix, "M", normData, scores1);
    expect(w[0]).toBeCloseTo(0.4129241782709729, 12);
    expect(w[1]).toBeCloseTo(0.5823100206154758, 12);
  });

  it("unitWeightsFn returns all ones", () => {
    expect(unitWeightsFn(tinyMmMatrix, "X", normData, scores1)).toEqual([1, 1]);
  });

  it("constructModeFn dispatches A/C to modeA, B to modeB, UNIT to unit weights", () => {
    expect(constructModeFn(tinyMmMatrix, "X")).toBe(modeA);
    expect(constructModeFn(tinyMmMatrix, "M")).toBe(modeB);
  });
});
