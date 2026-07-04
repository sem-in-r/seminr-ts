/**
 * Orthogonal interaction under CBSEM (plan Slice 2): parity vs the C6 fixture
 * — the R fixture seminr itself never had, generated to un-caveat the method
 * for covariance-based models.
 */

import { describe, it, expect } from "bun:test";
import { estimateCbsem } from "../../src/cbsem/estimateCbsem.ts";
import { summarizeCbsem } from "../../src/cbsem/summarize.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { interactionTerm, orthogonal } from "../../src/specify/interactions.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { loadFixture, loadMobi } from "../helpers/fixtures.ts";
import { expectTestthatEqual, type CbsemFixture } from "./helpers.ts";

const mobi = await loadMobi();

const partialMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", singleItem("CUEX3")),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);
const sm = relationships(
  paths({ from: ["Image", "Expectation", "Value", "Image*Expectation"], to: "Satisfaction" }),
);
const mm = [
  ...partialMm,
  interactionTerm({ iv: "Image", moderator: "Expectation", method: orthogonal }),
];

const fx = await loadFixture<CbsemFixture>("cbsem-C6_intxn_orthogonal");
const model = estimateCbsem(mobi, mm, sm);

describe("estimateCbsem: orthogonal interaction (C6)", () => {
  it("generates the same lavaan syntax and orthogonalized items", () => {
    expect(model.lavaanModel).toBe(fx.lavaanModel);
    const intxnCols = model.data.columns.filter((c) => !mobi.columns.includes(c));
    expect(intxnCols).toEqual(fx.interactionItemNames!);
    const colIdx = intxnCols.map((c) => model.data.columns.indexOf(c));
    const head = model.data.values.slice(0, 5).map((row) => colIdx.map((j) => row[j]!));
    expectTestthatEqual(head, fx.interactionDataHead!, 5e-5);
  });

  it("matches loadings, paths, and ten Berge scores", () => {
    expectTestthatEqual(model.factorLoadings.values, fx.factorLoadings, 5e-5);
    expectTestthatEqual(model.pathCoef.values, fx.pathCoef!, 5e-5);
    expectTestthatEqual(model.itemWeights.values, fx.tenBerge.weights, 5e-5);
  });

  it("matches MLR robust SEs and scaled fit (default estimator)", () => {
    const robust = model.estimation.robust!;
    expect(robust).toBeDefined();
    const pt = fx.mlr.parTable;
    for (let i = 0; i < pt.free.length; i++) {
      if (pt.free[i]! > 0) {
        const rel = Math.abs(robust.se[pt.free[i]! - 1]! - pt.se[i]!) / pt.se[i]!;
        expect(rel).toBeLessThan(1e-4);
      }
    }
    const fit = model.estimation.fitMeasures;
    for (const key of [
      "chisq.scaled",
      "chisq.scaling.factor",
      "baseline.chisq.scaling.factor",
      "cfi.robust",
      "tli.robust",
      "rmsea.scaled",
      "rmsea.robust",
    ]) {
      const expected = fx.mlr.fitMeasures[key]!;
      if (Math.abs(expected) < 1e-10) {
        // e.g. rmsea.scaled/robust are exactly 0 here (chisq.scaled < df)
        expect(Math.abs(fit[key]!)).toBeLessThan(1e-8);
      } else {
        const rel = Math.abs(fit[key]! - expected) / Math.abs(expected);
        expect(rel).toBeLessThan(1e-4);
      }
    }
  });

  it("summary reliability and paths tables match seminr", () => {
    const summary = summarizeCbsem(model);
    expect(summary.reliability.rows).toEqual(fx.reliability.rows!);
    expectTestthatEqual(summary.reliability.values, fx.reliability, 5e-5);
    expect(summary.pathsCoefficients.rows).toEqual(fx.pathsCoefficients!.rows!);
    expectTestthatEqual(summary.pathsCoefficients.values, fx.pathsCoefficients!, 5e-5);
  });
});
