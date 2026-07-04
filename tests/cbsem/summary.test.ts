import { describe, it, expect } from "bun:test";
import { buildParTable } from "../../src/cbsem/partable.ts";
import { sampleCovariance } from "../../src/cbsem/sigma.ts";
import { fitMl } from "../../src/cbsem/mlFit.ts";
import { standardizedSolution } from "../../src/cbsem/standardize.ts";
import { rhoCAve, antecedentVifs } from "../../src/cbsem/summary.ts";
import { namedMatrix } from "../../src/math/matrix.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { SmMatrix } from "../../src/model/smMatrix.ts";
import { MmMatrix } from "../../src/model/mmMatrix.ts";
import { selectColumns } from "../../src/estimate/data.ts";
import { loadFixture, loadMobi } from "../helpers/fixtures.ts";
import { expectTestthatEqual, type CbsemFixture } from "./helpers.ts";

const mobi = await loadMobi();

const c3Mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  reflective("Complaints", singleItem("CUSCO")),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const c3Am = associations(itemErrors(["PERQ1", "PERQ2"], "IMAG1"));
const c3Sm = SmMatrix.fromRows(relationships(
  paths({ from: ["Image", "Quality"], to: ["Value", "Satisfaction"] }),
  paths({ from: ["Value", "Satisfaction"], to: ["Complaints", "Loyalty"] }),
  paths({ from: "Complaints", to: "Loyalty" }),
));

const fx = await loadFixture<CbsemFixture>("cbsem-C3_ecsi");
const pt = buildParTable({ mmMatrix: MmMatrix.fromMeasurementModel(c3Mm), structuralModel: c3Sm, itemAssociations: c3Am });
const s = sampleCovariance(selectColumns(mobi, pt.observed));
const fit = fitMl(pt, s);
const std = standardizedSolution(pt, fit.matrices);

describe("rhoCAve", () => {
  it("matches seminr's reliability matrix (C3 ECSI)", () => {
    const loadings = namedMatrix(pt.observed, pt.latents, std.lambda);
    const rel = rhoCAve(loadings, pt.latents);
    expect(rel.rows).toEqual(fx.reliability.rows);
    expect(rel.cols).toEqual(["rhoC", "AVE"]);
    expectTestthatEqual(rel.values, fx.reliability);
  });

  it("returns 1/1 for single-indicator constructs", () => {
    const loadings = namedMatrix(["a", "b"], ["A", "B"], [
      [0.9, 0],
      [0, 0.8],
    ]);
    const rel = rhoCAve(loadings, ["A", "B"]);
    expect(rel.values[0]).toEqual([1, 1]);
    expect(rel.values[1]).toEqual([1, 1]);
  });
});

describe("antecedentVifs", () => {
  it("matches seminr's VIFs from construct correlations (C3 ECSI)", () => {
    const vifs = antecedentVifs(c3Sm, namedMatrix(pt.latents, pt.latents, std.corLv));
    const expected = fx.antecedentVifs!;
    expect(Object.keys(vifs)).toEqual(Object.keys(expected));
    for (const [outcome, byAntecedent] of Object.entries(expected)) {
      expect(Object.keys(vifs[outcome]!)).toEqual(Object.keys(byAntecedent));
      for (const [antecedent, vif] of Object.entries(byAntecedent)) {
        // VIF = 1/(1−R²) amplifies optimizer stopping error; compare relatively.
        expect(Math.abs(vifs[outcome]![antecedent]! - vif) / vif).toBeLessThan(5e-5);
      }
    }
  });

  it("returns NaN for a single-antecedent outcome (seminr NA)", () => {
    const sm = SmMatrix.fromRows(relationships(paths({ from: "A", to: "B" })));
    const cor = namedMatrix(["A", "B"], ["A", "B"], [
      [1, 0.5],
      [0.5, 1],
    ]);
    const vifs = antecedentVifs(sm, cor);
    expect(Number.isNaN(vifs["B"]!["A"]!)).toBe(true);
  });
});
