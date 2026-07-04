import { describe, it, expect } from "bun:test";
import { MmMatrix, measurementModelItems } from "../../src/model/mmMatrix.ts";
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
const mmMatrix = MmMatrix.fromMeasurementModel(mm);

describe("MmMatrix.fromMeasurementModel", () => {
  it("flattens construct specs into construct/measurement/type rows", () => {
    const rows = mmMatrix.toRows();
    expect(rows[0]).toEqual({ construct: "Image", measurement: "IMAG1", type: "A" });
    expect(rows.length).toBe(3 + 2 + 2 + 1 + 2);
    expect(rows[rows.length - 1]).toEqual({
      construct: "Satisfaction",
      measurement: "Value",
      type: "HOCA",
    });
  });
});

describe("MmMatrix accessors", () => {
  it("returns the items of a construct", () => {
    expect(mmMatrix.constructItems("Image")).toEqual(["IMAG1", "IMAG2", "IMAG3"]);
  });

  it("returns a construct's mode", () => {
    expect(mmMatrix.constructMode("Value")).toBe("B");
    expect(mmMatrix.constructMode("Expectation")).toBe("C");
  });

  it("throws on an unknown construct's mode", () => {
    expect(() => mmMatrix.constructMode("Nope")).toThrow("Unknown construct: Nope");
  });

  it("finds the construct that owns an item", () => {
    expect(mmMatrix.constructOfItem("PERV2")).toBe("Value");
    expect(mmMatrix.constructOfItem("NOPE")).toBeUndefined();
  });

  it("classifies modes: A includes HOCA; B includes HOCB; reflective is C", () => {
    expect(mmMatrix.isModeA("Image")).toBe(true);
    expect(mmMatrix.isModeA("Satisfaction")).toBe(true);
    expect(mmMatrix.isModeB("Value")).toBe(true);
    expect(mmMatrix.isModeA("Expectation")).toBe(false);
    expect(mmMatrix.isReflective("Expectation")).toBe(true);
    expect(mmMatrix.isUnitWeighted("Image")).toBe(false);
  });

  it("identifies HOCs and single items", () => {
    expect(mmMatrix.isHoc("Satisfaction")).toBe(true);
    expect(mmMatrix.isHoc("Image")).toBe(false);
    expect(mmMatrix.isSingleItem("Complaints")).toBe(true);
    expect(mmMatrix.isSingleItem("Image")).toBe(false);
  });

  it("lists constructs, constructs by mode, HOCs, LOCs, and items", () => {
    expect(mmMatrix.allConstructs()).toEqual([
      "Image",
      "Value",
      "Expectation",
      "Complaints",
      "Satisfaction",
    ]);
    expect(mmMatrix.allConstructsOfMode("C")).toEqual(["Expectation"]);
    expect(mmMatrix.allHoc()).toEqual(["Satisfaction"]);
    expect(mmMatrix.allLoc()).toEqual(["Image", "Value", "Expectation", "Complaints"]);
    expect(mmMatrix.allItems()).toContain("CUSCO");
  });
});

describe("MmMatrix transforms and escape hatches", () => {
  it("appendRows returns a new instance and leaves the original unchanged", () => {
    const appended = mmMatrix.appendRows([
      { construct: "Image*Expectation", measurement: "Image*Expectation", type: "C" },
    ]);
    expect(appended).not.toBe(mmMatrix);
    expect(appended.allConstructs()).toContain("Image*Expectation");
    expect(appended.toRows().length).toBe(mmMatrix.toRows().length + 1);
    expect(mmMatrix.allConstructs()).not.toContain("Image*Expectation");
  });

  it("rowsForItems keeps only rows whose measurement is in the given items, preserving order", () => {
    const subset = mmMatrix.rowsForItems(["PERV2", "IMAG1", "CUSCO"]);
    expect(subset.toRows()).toEqual([
      { construct: "Image", measurement: "IMAG1", type: "A" },
      { construct: "Value", measurement: "PERV2", type: "B" },
      { construct: "Complaints", measurement: "CUSCO", type: "A" },
    ]);
    expect(mmMatrix.allItems()).toContain("IMAG2");
  });

  it("mapNames renames construct and measurement fields, returning a new instance", () => {
    const withInteraction = mmMatrix.appendRows([
      { construct: "Image*Expectation", measurement: "Image*Expectation", type: "C" },
    ]);
    const renamed = withInteraction.mapNames((name) => name.replace(/\*/g, "_x_"));
    expect(renamed.allConstructs()).toContain("Image_x_Expectation");
    expect(renamed.constructItems("Image_x_Expectation")).toEqual(["Image_x_Expectation"]);
    expect(renamed.constructItems("Image")).toEqual(["IMAG1", "IMAG2", "IMAG3"]);
    expect(withInteraction.allConstructs()).toContain("Image*Expectation");
  });

  it("from() accepts plain rows or an existing instance", () => {
    expect(MmMatrix.from(mmMatrix.toRows()).toRows()).toEqual(mmMatrix.toRows());
    expect(MmMatrix.from(mmMatrix)).toBe(mmMatrix);
  });

  it("round-trips through fromRows/toRows and serializes to rows as JSON", () => {
    const revived = MmMatrix.fromRows(mmMatrix.toRows());
    expect(revived.toRows()).toEqual(mmMatrix.toRows());
    expect(JSON.parse(JSON.stringify(mmMatrix))).toEqual(
      JSON.parse(JSON.stringify(mmMatrix.toRows())),
    );
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
