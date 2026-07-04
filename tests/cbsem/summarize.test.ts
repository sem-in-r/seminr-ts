import { describe, it, expect } from "bun:test";
import { estimateCfa } from "../../src/cbsem/estimateCfa.ts";
import { estimateCbsem } from "../../src/cbsem/estimateCbsem.ts";
import { summarizeCbsem, summarizeCfa } from "../../src/cbsem/summarize.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { interactionTerm, productIndicator } from "../../src/specify/interactions.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { loadFixture, loadMobi } from "../helpers/fixtures.ts";
import { expectTestthatEqual, type CbsemFixture } from "./helpers.ts";

const mobi = await loadMobi();

const c1Mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Complaints", singleItem("CUSCO")),
);
const c1Am = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

describe("summarizeCfa (C1 demo)", () => {
  it("carries reliability and fit matching the fixture", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C1_cfa_demo");
    const model = estimateCfa(mobi, c1Mm, c1Am);
    const summary = summarizeCfa(model);
    expect(summary.reliability.rows).toEqual(fx.reliability.rows!);
    expectTestthatEqual(summary.reliability.values, fx.reliability);
    expect(summary.fit["chisq"]!).toBeCloseTo(fx.ml.fitMeasures["chisq"]!, 5);
    expect(summary.fit["cfi"]!).toBeCloseTo(fx.ml.fitMeasures["cfi"]!, 7);
    expect(summary.loadings.rows).toEqual(fx.factorLoadings.rows!);
  });
});

describe("summarizeCbsem (C2 demo)", () => {
  const c2Mm = [
    ...c1Mm,
    interactionTerm({ iv: "Image", moderator: "Expectation", method: productIndicator }),
  ];
  const c2Sm = relationships(
    paths({ from: ["Image", "Expectation"], to: ["Value", "Loyalty"] }),
    paths({ from: ["Complaints", "Image*Expectation"], to: "Loyalty" }),
  );

  it("reproduces seminr's summary quality + paths tables", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C2_demo_pi_interaction");
    const model = estimateCbsem(mobi, c2Mm, c2Sm, c1Am);
    const summary = summarizeCbsem(model);

    // reliability rows exclude the interaction construct
    expect(summary.reliability.rows).toEqual(fx.reliability.rows!);
    expectTestthatEqual(summary.reliability.values, fx.reliability, 5e-5);

    // paths coefficients: R^2 row + antecedents (lavaanified names, seminr quirk)
    expect(summary.pathsCoefficients.rows).toEqual(fx.pathsCoefficients!.rows!);
    expect(summary.pathsCoefficients.cols).toEqual(fx.pathsCoefficients!.cols);
    expectTestthatEqual(summary.pathsCoefficients.values, fx.pathsCoefficients!, 5e-5);

    // antecedent VIFs keyed by outcome with lavaanified antecedent names
    const expected = fx.antecedentVifs!;
    expect(Object.keys(summary.antecedentVifs)).toEqual(Object.keys(expected));
    for (const [outcome, byAntecedent] of Object.entries(expected)) {
      for (const [antecedent, vif] of Object.entries(byAntecedent)) {
        expect(
          Math.abs(summary.antecedentVifs[outcome]![antecedent]! - vif) / vif,
        ).toBeLessThan(1e-4);
      }
    }

    // construct correlations = cor.lv
    expectTestthatEqual(summary.constructCorrelations.values, fx.ml.corLv, 5e-5);

    // significance table exposes the structural rows
    const pathRows = summary.paths.filter((row) => row.op === "~");
    expect(pathRows.length).toBe(c2Sm.length);
    for (const row of pathRows) {
      expect(row.se).toBeGreaterThan(0);
      expect(Number.isFinite(row.pvalue!)).toBe(true);
    }
  });
});
