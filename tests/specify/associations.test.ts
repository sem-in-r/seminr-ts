import { describe, it, expect } from "bun:test";
import { associations, itemErrors } from "../../src/specify/associations.ts";

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
