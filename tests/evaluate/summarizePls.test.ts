import { describe, it, expect } from "bun:test";
import { summarizePls } from "../../src/evaluate/summarizePls.ts";
import { summarize } from "../../src/cbsem/summarize.ts";
import { htmt } from "../../src/evaluate/validity.ts";
import { nmGet } from "../../src/math/matrix.ts";
import { loadFixture, expectMatrixCloseNa, type FixtureMatrix } from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import { m1Model, m3Model } from "./models.ts";

interface EvalFixture {
  reliability: FixtureMatrix;
  pathsReport: FixtureMatrix;
  totalIndirectEffects: FixtureMatrix;
}

describe("summarizePls", () => {
  it("assembles the seminr summary shape for M1", async () => {
    const fx = await loadFixture<EvalFixture>("M7_evaluation_m1");
    const model = m1Model();
    const summary = summarizePls(model);

    expect(summary.iterations).toBe(model.iterations);
    expectMatrixCloseNa(summary.paths, fx.pathsReport, PARITY_TOLERANCE, "summary.paths");
    expectMatrixCloseNa(
      summary.reliability,
      fx.reliability,
      PARITY_TOLERANCE,
      "summary.reliability",
    );
    expectMatrixCloseNa(
      summary.totalIndirectEffects,
      fx.totalIndirectEffects,
      PARITY_TOLERANCE,
      "summary.totalIndirectEffects",
    );
    expect(summary.loadings).toBe(model.outerLoadings);
    expect(summary.weights).toBe(model.outerWeights);

    // htmt is stored transposed, as summary.seminr_model does
    const raw = htmt(model);
    expect(summary.validity.htmt.rows).toEqual(raw.cols);
    expect(nmGet(summary.validity.htmt, "Expectation", "Image")).toBeCloseTo(
      nmGet(raw, "Image", "Expectation"),
      12,
    );
    expect(Number.isNaN(nmGet(summary.validity.htmt, "Image", "Expectation"))).toBe(true);

    // all-composite model: compositeScores are the construct scores
    expect(summary.compositeScores).not.toBeNull();
    expect(summary.compositeScores!.cols).toEqual(model.constructScores.cols);

    expect(summary.missingData.method).toBe("mean_replacement");
    expect(summary.missingData.summary.map((s) => s.variable)).toEqual(model.mmVariables);
    expect(summary.missingData.summary.every((s) => s.missingCount === 0)).toBe(true);
  });

  it("returns null compositeScores for an all-reflective model", () => {
    const summary = summarizePls(m3Model());
    expect(summary.compositeScores).toBeNull();
  });

  it("is dispatched by summarize() on kind === 'pls'", () => {
    const model = m1Model();
    const summary = summarize(model);
    expect(summary.iterations).toBe(model.iterations);
    expect(summary.validity.flCriteria.rows).toEqual(model.constructScores.cols);
  });
});
