import { describe, it, expect } from "bun:test";
import {
  allEndogenous,
  allExogenous,
  onlyExogenous,
  onlyEndogenous,
  allInteractions,
  constructAntecedents,
  constructTargets,
  constructNames,
  isInteraction,
  hasInteractions,
  removePathsTo,
  removePathsFrom,
} from "../../src/model/smMatrix.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";

// Image -> Expectation -> Satisfaction; Image -> Satisfaction -> Loyalty
const sm = relationships(
  paths("Image", ["Expectation", "Satisfaction"]),
  paths("Expectation", "Satisfaction"),
  paths("Satisfaction", "Loyalty"),
);

describe("smMatrix accessors", () => {
  it("lists unique endogenous constructs (targets)", () => {
    expect(allEndogenous(sm)).toEqual(["Expectation", "Satisfaction", "Loyalty"]);
  });

  it("lists unique exogenous constructs (sources)", () => {
    expect(allExogenous(sm)).toEqual(["Image", "Expectation", "Satisfaction"]);
  });

  it("finds purely exogenous and purely endogenous constructs", () => {
    expect(onlyExogenous(sm)).toEqual(["Image"]);
    expect(onlyEndogenous(sm)).toEqual(["Loyalty"]);
  });

  it("returns antecedents of a target in path order", () => {
    expect(constructAntecedents(sm, "Satisfaction")).toEqual(["Image", "Expectation"]);
  });

  it("returns targets of a source", () => {
    expect(constructTargets(sm, "Image")).toEqual(["Expectation", "Satisfaction"]);
  });

  it("lists all construct names (sources then targets, unique)", () => {
    expect(constructNames(sm)).toEqual([
      "Image",
      "Expectation",
      "Satisfaction",
      "Loyalty",
    ]);
  });
});

describe("interaction predicates", () => {
  const smInt = relationships(
    paths(["Image", "Expectation", "Image*Expectation"], "Satisfaction"),
  );

  it("detects interaction names by '*'", () => {
    expect(isInteraction("Image*Expectation")).toBe(true);
    expect(isInteraction("Image")).toBe(false);
  });

  it("lists interaction constructs in the structural model", () => {
    expect(allInteractions(smInt)).toEqual(["Image*Expectation"]);
    expect(allInteractions(sm)).toEqual([]);
  });

  it("reports whether the model has interactions", () => {
    expect(hasInteractions(smInt)).toBe(true);
    expect(hasInteractions(sm)).toBe(false);
  });
});

describe("smMatrix mutators", () => {
  it("removes paths to a target", () => {
    expect(removePathsTo(sm, ["Loyalty"])).toEqual(
      sm.filter((r) => r.target !== "Loyalty"),
    );
  });

  it("removes paths from a source", () => {
    expect(removePathsFrom(sm, ["Image"])).toEqual(
      sm.filter((r) => r.source !== "Image"),
    );
  });
});
