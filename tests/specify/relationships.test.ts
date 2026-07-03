import { describe, it, expect } from "bun:test";
import { paths, relationships } from "../../src/specify/relationships.ts";

describe("paths", () => {
  it("creates one row for a single from/to pair", () => {
    expect(paths("Image", "Satisfaction")).toEqual([
      { source: "Image", target: "Satisfaction" },
    ]);
  });

  it("expands the Cartesian product with 'from' varying fastest (R expand.grid order)", () => {
    expect(paths(["A", "B"], ["X", "Y"])).toEqual([
      { source: "A", target: "X" },
      { source: "B", target: "X" },
      { source: "A", target: "Y" },
      { source: "B", target: "Y" },
    ]);
  });

  it("accepts the named form paths({from, to}), as R's paths(from=, to=)", () => {
    expect(paths({ from: ["A", "B"], to: "X" })).toEqual(paths(["A", "B"], "X"));
    expect(paths({ from: "A", to: ["X", "Y"] })).toEqual(paths("A", ["X", "Y"]));
  });
});

describe("relationships", () => {
  it("concatenates path groups into an smMatrix", () => {
    const sm = relationships(
      paths(["Image", "Expectation"], "Satisfaction"),
      paths("Satisfaction", "Loyalty"),
    );
    expect(sm).toEqual([
      { source: "Image", target: "Satisfaction" },
      { source: "Expectation", target: "Satisfaction" },
      { source: "Satisfaction", target: "Loyalty" },
    ]);
  });
});
