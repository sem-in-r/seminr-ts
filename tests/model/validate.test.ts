import { describe, it, expect } from "bun:test";
import {
  assessModelSpecification,
  validateSingleItemModeB,
} from "../../src/model/validate.ts";
import {
  constructs,
  composite,
  multiItems,
  singleItem,
  regressionWeights,
} from "../../src/specify/constructs.ts";
import { buildMmMatrix } from "../../src/model/mmMatrix.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";

const mm = constructs(
  composite("Image", multiItems("IMAG", [1, 2])),
  composite("Expectation", multiItems("CUEX", [1, 2])),
  composite("Satisfaction", multiItems("CUSA", [1, 2])),
);
const dataColumns = ["IMAG1", "IMAG2", "CUEX1", "CUEX2", "CUSA1", "CUSA2"];

describe("assessModelSpecification", () => {
  it("accepts a well-specified model", () => {
    const sm = relationships(paths(["Image", "Expectation"], "Satisfaction"));
    expect(() => assessModelSpecification(mm, sm, dataColumns)).not.toThrow();
  });

  it("throws when a structural construct is missing from the measurement model", () => {
    const sm = relationships(paths("Imagine", "Satisfaction"));
    expect(() => assessModelSpecification(mm, sm, dataColumns)).toThrow(/construct names/i);
  });

  it("ignores interaction names in the misspelling check but requires direct effects", () => {
    const smOk = relationships(
      paths(["Image", "Expectation", "Image*Expectation"], "Satisfaction"),
    );
    expect(() => assessModelSpecification(mm, smOk, dataColumns)).not.toThrow();

    const smMissingDirect = relationships(
      paths(["Image", "Image*Expectation"], "Satisfaction"),
    );
    expect(() => assessModelSpecification(mm, smMissingDirect, dataColumns)).toThrow(
      /direct effects/i,
    );
  });

  it("throws when a construct name collides with an item name", () => {
    const collidingMm = constructs(
      composite("IMAG1", multiItems("IMAG", [1, 2])),
      composite("Satisfaction", multiItems("CUSA", [1, 2])),
    );
    const sm = relationships(paths("IMAG1", "Satisfaction"));
    expect(() => assessModelSpecification(collidingMm, sm, dataColumns)).toThrow(/collide/i);
  });

  it("throws when an indicator is missing from the data columns", () => {
    const sm = relationships(paths(["Image", "Expectation"], "Satisfaction"));
    expect(() => assessModelSpecification(mm, sm, ["IMAG1", "IMAG2", "CUEX1", "CUEX2"])).toThrow(
      /mismatch/i,
    );
  });
});

describe("validateSingleItemModeB", () => {
  it("throws for a single-item mode B construct", () => {
    const badMm = buildMmMatrix(
      constructs(composite("Complaints", singleItem("CUSCO"), regressionWeights)),
    );
    expect(() => validateSingleItemModeB(badMm)).toThrow(/single item.*mode B/i);
  });

  it("accepts a single-item mode A construct", () => {
    const okMm = buildMmMatrix(constructs(composite("Complaints", singleItem("CUSCO"))));
    expect(() => validateSingleItemModeB(okMm)).not.toThrow();
  });
});
