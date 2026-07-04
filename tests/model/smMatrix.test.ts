import { describe, it, expect } from "bun:test";
import { SmMatrix, isInteraction } from "../../src/model/smMatrix.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";

// Image -> Expectation -> Satisfaction; Image -> Satisfaction -> Loyalty
const rows = relationships(
  paths("Image", ["Expectation", "Satisfaction"]),
  paths("Expectation", "Satisfaction"),
  paths("Satisfaction", "Loyalty"),
);
const sm = SmMatrix.fromRows(rows);

describe("SmMatrix accessors", () => {
  it("lists unique endogenous constructs (targets)", () => {
    expect(sm.allEndogenous()).toEqual(["Expectation", "Satisfaction", "Loyalty"]);
  });

  it("lists unique exogenous constructs (sources)", () => {
    expect(sm.allExogenous()).toEqual(["Image", "Expectation", "Satisfaction"]);
  });

  it("finds purely exogenous and purely endogenous constructs", () => {
    expect(sm.onlyExogenous()).toEqual(["Image"]);
    expect(sm.onlyEndogenous()).toEqual(["Loyalty"]);
  });

  it("returns antecedents of a target in path order", () => {
    expect(sm.constructAntecedents("Satisfaction")).toEqual(["Image", "Expectation"]);
  });

  it("returns targets of a source", () => {
    expect(sm.constructTargets("Image")).toEqual(["Expectation", "Satisfaction"]);
  });

  it("lists all construct names (sources then targets, unique)", () => {
    expect(sm.constructNames()).toEqual(["Image", "Expectation", "Satisfaction", "Loyalty"]);
  });

  it("reports the presence of individual paths", () => {
    expect(sm.hasPath("Image", "Satisfaction")).toBe(true);
    expect(sm.hasPath("Satisfaction", "Image")).toBe(false);
  });

  it("reports emptiness", () => {
    expect(sm.isEmpty()).toBe(false);
    expect(SmMatrix.fromRows([]).isEmpty()).toBe(true);
  });
});

describe("interaction predicates", () => {
  const smInt = SmMatrix.fromRows(
    relationships(paths(["Image", "Expectation", "Image*Expectation"], "Satisfaction")),
  );

  it("detects interaction names by '*'", () => {
    expect(isInteraction("Image*Expectation")).toBe(true);
    expect(isInteraction("Image")).toBe(false);
  });

  it("lists interaction constructs in the structural model", () => {
    expect(smInt.allInteractions()).toEqual(["Image*Expectation"]);
    expect(sm.allInteractions()).toEqual([]);
  });

  it("reports whether the model has interactions", () => {
    expect(smInt.hasInteractions()).toBe(true);
    expect(sm.hasInteractions()).toBe(false);
  });
});

describe("SmMatrix transforms", () => {
  it("removePathsTo returns a new instance without paths to the targets", () => {
    const pruned = sm.removePathsTo(["Loyalty"]);
    expect(pruned.toRows()).toEqual(rows.filter((r) => r.target !== "Loyalty"));
    expect(sm.constructTargets("Satisfaction")).toEqual(["Loyalty"]);
  });

  it("removePathsFrom returns a new instance without paths from the sources", () => {
    const pruned = sm.removePathsFrom(["Image"]);
    expect(pruned.toRows()).toEqual(rows.filter((r) => r.source !== "Image"));
  });

  it("keepPathsFrom keeps only paths whose source is in the given list", () => {
    const kept = sm.keepPathsFrom(["Image", "Expectation"]);
    expect(kept.toRows()).toEqual(rows.filter((r) => r.source !== "Satisfaction"));
    expect(sm.toRows()).toEqual(rows);
  });

  it("appendPaths returns a new instance with the extra paths at the end", () => {
    const extended = sm.appendPaths(paths("Loyalty", "Complaints"));
    expect(extended.toRows()).toEqual([...rows, { source: "Loyalty", target: "Complaints" }]);
    expect(sm.toRows()).toEqual(rows);
  });

  it("mapNames renames sources and targets, returning a new instance", () => {
    const smInt = SmMatrix.fromRows(
      relationships(paths(["Image", "Image*Expectation"], "Satisfaction")),
    );
    const renamed = smInt.mapNames((name) => name.replace(/\*/g, "_x_"));
    expect(renamed.allExogenous()).toEqual(["Image", "Image_x_Expectation"]);
    expect(smInt.allExogenous()).toEqual(["Image", "Image*Expectation"]);
  });

  it("from() accepts plain rows or an existing instance", () => {
    expect(SmMatrix.from(rows).toRows()).toEqual(rows);
    expect(SmMatrix.from(sm)).toBe(sm);
  });

  it("round-trips through fromRows/toRows and serializes to rows as JSON", () => {
    const revived = SmMatrix.fromRows(sm.toRows());
    expect(revived.toRows()).toEqual(sm.toRows());
    expect(JSON.parse(JSON.stringify(sm))).toEqual(JSON.parse(JSON.stringify(rows)));
  });
});
