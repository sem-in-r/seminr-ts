import { describe, it, expect } from "bun:test";
import { associations, itemErrors, hasAssociations, associationPairs, associationItems } from "../../src/specify/associations.ts";

describe("itemErrors", () => {
  it("expands the cartesian product with items_a varying fastest, each pair sorted", () => {
    // R: expand.grid(c("PERQ1","PERQ2"), "CUEX3") then row-sort
    expect(itemErrors(["PERQ1", "PERQ2"], "CUEX3")).toEqual([
      ["CUEX3", "PERQ1"],
      ["CUEX3", "PERQ2"],
    ]);
  });

  it("accepts single strings on both sides", () => {
    expect(itemErrors("IMAG1", "CUEX2")).toEqual([["CUEX2", "IMAG1"]]);
  });

  it("dedupes pairs that sort to the same row", () => {
    // R: item_errors(c("a1","a2"), c("a1","a2")) -> (a1,a1),(a1,a2),(a2,a2)
    expect(itemErrors(["a1", "a2"], ["a1", "a2"])).toEqual([
      ["a1", "a1"],
      ["a1", "a2"],
      ["a2", "a2"],
    ]);
  });
});

describe("associations", () => {
  it("concatenates item_errors blocks in order (R rbind)", () => {
    expect(associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"))).toEqual([
      ["CUEX3", "PERQ1"],
      ["CUEX3", "PERQ2"],
      ["CUEX2", "IMAG1"],
    ]);
  });

  it("returns an empty list for no arguments", () => {
    expect(associations()).toEqual([]);
  });
});

describe("association accessors", () => {
  const am = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

  it("hasAssociations is false for empty, null, and undefined", () => {
    expect(hasAssociations(am)).toBe(true);
    expect(hasAssociations([])).toBe(false);
    expect(hasAssociations(undefined)).toBe(false);
    expect(hasAssociations(null)).toBe(false);
  });

  it("associationPairs normalizes null/undefined to an empty list", () => {
    expect(associationPairs(am)).toEqual(am);
    expect(associationPairs(undefined)).toEqual([]);
    expect(associationPairs(null)).toEqual([]);
  });

  it("associationItems lists items in pair appearance order, deduped", () => {
    expect(associationItems(am)).toEqual(["CUEX3", "PERQ1", "PERQ2", "CUEX2", "IMAG1"]);
    expect(associationItems(undefined)).toEqual([]);
  });
});
