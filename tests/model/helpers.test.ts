import { describe, it, expect } from "bun:test";
import {
  allFactors,
  allComposites,
  constructNames,
  constructItems,
  constructType,
  constructMode,
} from "../../src/model/helpers.ts";
import { m1Model, m3Model, m4piModel, m5Model } from "../evaluate/models.ts";

describe("model traversal helpers (seminr helpers-model.R / helpers-mmMatrix.R)", () => {
  it("allFactors returns reflective constructs, allComposites the rest", () => {
    const m1 = m1Model();
    expect(allFactors(m1)).toEqual([]);
    expect(allComposites(m1)).toEqual(["Image", "Expectation", "Value", "Satisfaction"]);

    const m3 = m3Model();
    expect(allFactors(m3)).toEqual(["Image", "Expectation", "Value", "Satisfaction"]);
    expect(allComposites(m3)).toEqual([]);
  });

  it("constructNames intersects structural and measurement constructs", () => {
    expect(constructNames(m1Model())).toEqual(["Image", "Expectation", "Value", "Satisfaction"]);
  });

  it("constructNames unions first-stage constructs for HOC models", () => {
    const names = constructNames(m5Model());
    expect(names).toContain("Satisfaction"); // the HOC itself
    expect(names).toContain("Image"); // first-stage dimension
    expect(names).toContain("Value");
  });

  it("constructItems returns the measured items of a construct", () => {
    expect(constructItems(m1Model(), "Image")).toEqual([
      "IMAG1",
      "IMAG2",
      "IMAG3",
      "IMAG4",
      "IMAG5",
    ]);
  });

  it("constructType reads the DSL type code and flags interactions", () => {
    const m4 = m4piModel();
    expect(constructType(m4, "Image")).toBe("A");
    expect(constructType(m4, "Image*Expectation")).toBe("interaction");
    expect(constructType(m3Model(), "Image")).toBe("C");
  });

  it("constructMode reads the mmMatrix type code", () => {
    const m1 = m1Model();
    expect(constructMode(m1.mmMatrix, "Image")).toBe("A");
    expect(constructMode(m1.mmMatrix, "Value")).toBe("B");
  });
});
