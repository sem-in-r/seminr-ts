import { describe, it, expect } from "bun:test";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import { bootstrapModel } from "../../src/bootstrap/bootstrap.ts";
import { estimateCfa } from "../../src/cbsem/estimateCfa.ts";
import { estimateCbsem } from "../../src/cbsem/estimateCbsem.ts";
import { summarize, summarizeCbsem, summarizeCfa } from "../../src/cbsem/summarize.ts";
import { constructs, multiItems, reflective } from "../../src/specify/constructs.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { tinyData, tinyMm, tinySm } from "../estimate/tiny.ts";
import { loadMobi } from "../helpers/fixtures.ts";

const mobi = await loadMobi();
const smallMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const smallSm = relationships(paths("Image", "Loyalty"));

describe("model kind discriminants", () => {
  it("tags PLS and bootstrapped models", () => {
    const pls = estimatePls(tinyData, tinyMm, tinySm);
    expect(pls.kind).toBe("pls");
    const boot = bootstrapModel(pls, { nboot: 2 });
    expect(boot.kind).toBe("boot");
  });

  it("tags CFA and CBSEM models", () => {
    expect(estimateCfa(mobi, smallMm).kind).toBe("cfa");
    expect(estimateCbsem(mobi, smallMm, smallSm).kind).toBe("cbsem");
  });
});

describe("summarize dispatch", () => {
  it("routes CFA models to summarizeCfa and CBSEM models to summarizeCbsem", () => {
    const cfa = estimateCfa(mobi, smallMm);
    const cbsem = estimateCbsem(mobi, smallMm, smallSm);
    expect(summarize(cfa)).toEqual(summarizeCfa(cfa));
    expect(summarize(cbsem)).toEqual(summarizeCbsem(cbsem));
    // the cbsem summary is the one with paths
    expect("pathsCoefficients" in summarize(cbsem)).toBe(true);
  });
});
