import { describe, it, expect } from "bun:test";
import { simplePls, initialOuterWeights, initialPathsMatrix } from "../../src/estimate/simplePls.ts";
import { nmGet } from "../../src/math/matrix.ts";
import { tinyData, tinyMmMatrix, tinySm } from "./tiny.ts";

const mmVariables = ["x1", "x2", "m1", "m2", "y1", "y2"];
const constructNames = ["X", "M", "Y"];

describe("initialization", () => {
  it("initial outer weights are 1 where the item belongs to the construct", () => {
    const w = initialOuterWeights(tinyMmMatrix, mmVariables, constructNames);
    expect(w.rows).toEqual(mmVariables);
    expect(w.cols).toEqual(constructNames);
    expect(nmGet(w, "x1", "X")).toBe(1);
    expect(nmGet(w, "x1", "M")).toBe(0);
    expect(nmGet(w, "m2", "M")).toBe(1);
    expect(nmGet(w, "y2", "Y")).toBe(1);
  });

  it("initial paths matrix is 1 at [source, target] for each structural path", () => {
    const p = initialPathsMatrix(tinySm, constructNames);
    expect(nmGet(p, "X", "Y")).toBe(1);
    expect(nmGet(p, "M", "Y")).toBe(1);
    expect(nmGet(p, "Y", "X")).toBe(0);
    expect(nmGet(p, "X", "M")).toBe(0);
  });
});

describe("simplePls on the tiny model (R-computed references)", () => {
  it("matches R after a single iteration (maxIt=0)", () => {
    const fit = simplePls(tinyData, tinySm, tinyMmMatrix, { maxIt: 0 });
    expect(fit.iterations).toBe(0);
    expect(nmGet(fit.outerWeights, "x1", "X")).toBeCloseTo(0.5729950410596034, 12);
    expect(nmGet(fit.outerWeights, "x2", "X")).toBeCloseTo(0.4723761175591433, 12);
    expect(nmGet(fit.outerWeights, "m1", "M")).toBeCloseTo(0.4379620542718445, 12);
    expect(nmGet(fit.outerWeights, "m2", "M")).toBeCloseTo(0.6176186967779735, 12);
    expect(nmGet(fit.outerWeights, "y1", "Y")).toBeCloseTo(0.5680866515517199, 12);
    expect(nmGet(fit.outerWeights, "y2", "Y")).toBeCloseTo(0.5001991752822789, 12);
    expect(fit.weightDiff).toBeCloseTo(2.830762263497437, 10);
  });

  it("converges to the R solution with default settings", () => {
    const fit = simplePls(tinyData, tinySm, tinyMmMatrix);
    expect(fit.iterations).toBe(8);

    expect(nmGet(fit.outerWeights, "x1", "X")).toBeCloseTo(0.5733511349587112, 10);
    expect(nmGet(fit.outerWeights, "m1", "M")).toBeCloseTo(0.4504418580777681, 10);
    expect(nmGet(fit.outerWeights, "y2", "Y")).toBeCloseTo(0.5029103546056903, 10);

    expect(nmGet(fit.pathCoef, "X", "Y")).toBeCloseTo(0.2832609788944624, 10);
    expect(nmGet(fit.pathCoef, "M", "Y")).toBeCloseTo(0.6885087884685204, 10);
    expect(nmGet(fit.pathCoef, "Y", "X")).toBe(0);

    expect(nmGet(fit.outerLoadings, "x1", "X")).toBeCloseTo(0.9644480475882252, 10);
    expect(nmGet(fit.outerLoadings, "m2", "M")).toBeCloseTo(0.9609108670926607, 10);
    expect(nmGet(fit.outerLoadings, "x1", "M")).toBe(0);

    expect(nmGet(fit.rSquared, "Rsq", "Y")).toBeCloseTo(0.907743448408207, 10);
    expect(nmGet(fit.rSquared, "AdjRsq", "Y")).toBeCloseTo(0.8462390806803449, 10);

    // first construct-scores row
    expect(nmGet(fit.constructScores, "1", "X")).toBeCloseTo(-1.144625436754309, 10);
    expect(nmGet(fit.constructScores, "2", "M")).toBeCloseTo(-0.7587415052972847, 10);

    expect(fit.meanData["m2"]).toBeCloseTo(4, 12);
    expect(fit.sdData["y1"]).toBeCloseTo(1.722401424368508, 12);
    expect(fit.constructs).toEqual(constructNames);
    expect(fit.mmVariables).toEqual(mmVariables);
  });

  it("reports iterations === maxIt when stopped before convergence", () => {
    const fit = simplePls(tinyData, tinySm, tinyMmMatrix, { maxIt: 2 });
    expect(fit.iterations).toBe(2);
  });

  it("throws on zero-variance items", () => {
    const constData = {
      columns: tinyData.columns,
      values: tinyData.values.map((row) => [5, ...row.slice(1)]),
    };
    expect(() => simplePls(constData, tinySm, tinyMmMatrix)).toThrow(/variance/i);
  });
});
