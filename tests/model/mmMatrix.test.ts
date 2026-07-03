import { describe, it, expect } from "bun:test";
import {
  buildMmMatrix,
  constructItems,
  constructMode,
  constructOfItem,
  isModeA,
  isModeB,
  isReflective,
  isHoc,
  isSingleItem,
  allConstructs,
  allConstructsOfMode,
  allHoc,
  allLoc,
  allItems,
  measurementModelItems,
} from "../../src/model/mmMatrix.ts";
import {
  constructs,
  composite,
  reflective,
  higherComposite,
  multiItems,
  singleItem,
  regressionWeights,
} from "../../src/specify/constructs.ts";

const mm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3])),
  composite("Value", multiItems("PERV", [1, 2]), regressionWeights),
  reflective("Expectation", multiItems("CUEX", [1, 2])),
  composite("Complaints", singleItem("CUSCO")),
  higherComposite("Satisfaction", ["Image", "Value"]),
);
const mmMatrix = buildMmMatrix(mm);

describe("buildMmMatrix", () => {
  it("flattens construct specs into construct/measurement/type rows", () => {
    expect(mmMatrix[0]).toEqual({ construct: "Image", measurement: "IMAG1", type: "A" });
    expect(mmMatrix.length).toBe(3 + 2 + 2 + 1 + 2);
    expect(mmMatrix[mmMatrix.length - 1]).toEqual({
      construct: "Satisfaction",
      measurement: "Value",
      type: "HOCA",
    });
  });
});

describe("mmMatrix accessors", () => {
  it("returns the items of a construct", () => {
    expect(constructItems(mmMatrix, "Image")).toEqual(["IMAG1", "IMAG2", "IMAG3"]);
  });

  it("returns a construct's mode", () => {
    expect(constructMode(mmMatrix, "Value")).toBe("B");
    expect(constructMode(mmMatrix, "Expectation")).toBe("C");
  });

  it("finds the construct that owns an item", () => {
    expect(constructOfItem(mmMatrix, "PERV2")).toBe("Value");
  });

  it("classifies modes: A includes HOCA; B includes HOCB; reflective is C", () => {
    expect(isModeA(mmMatrix, "Image")).toBe(true);
    expect(isModeA(mmMatrix, "Satisfaction")).toBe(true);
    expect(isModeB(mmMatrix, "Value")).toBe(true);
    expect(isModeA(mmMatrix, "Expectation")).toBe(false);
    expect(isReflective(mmMatrix, "Expectation")).toBe(true);
  });

  it("identifies HOCs and single items", () => {
    expect(isHoc(mmMatrix, "Satisfaction")).toBe(true);
    expect(isHoc(mmMatrix, "Image")).toBe(false);
    expect(isSingleItem(mmMatrix, "Complaints")).toBe(true);
    expect(isSingleItem(mmMatrix, "Image")).toBe(false);
  });

  it("lists constructs, constructs by mode, HOCs, LOCs, and items", () => {
    expect(allConstructs(mmMatrix)).toEqual([
      "Image",
      "Value",
      "Expectation",
      "Complaints",
      "Satisfaction",
    ]);
    expect(allConstructsOfMode(mmMatrix, "C")).toEqual(["Expectation"]);
    expect(allHoc(mmMatrix)).toEqual(["Satisfaction"]);
    expect(allLoc(mmMatrix)).toEqual(["Image", "Value", "Expectation", "Complaints"]);
    expect(allItems(mmMatrix)).toContain("CUSCO");
  });
});

describe("measurementModelItems", () => {
  it("returns unique lower-order items from the measurement model list (excludes HOC dimension entries)", () => {
    expect(measurementModelItems(mm)).toEqual([
      "IMAG1",
      "IMAG2",
      "IMAG3",
      "PERV1",
      "PERV2",
      "CUEX1",
      "CUEX2",
      "CUSCO",
    ]);
  });
});
