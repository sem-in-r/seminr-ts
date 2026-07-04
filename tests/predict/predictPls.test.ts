import { describe, it, expect } from "bun:test";
import { predictPls } from "../../src/predict/predictPls.ts";
import { predictDA, predictEA, type PredictTechnique } from "../../src/predict/techniques.ts";
import { summarizePlsPredict } from "../../src/predict/metrics.ts";
import type { PlsModel } from "../../src/estimate/estimatePls.ts";
import {
  loadFixture,
  expectMatrixClose,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import {
  m1Model,
  m2Model,
  m4piModel,
  m4orthoModel,
  m4tsModel,
  m5Model,
} from "../evaluate/models.ts";

interface PredictFixture {
  shuffleOrder: number[][];
  compositesOutOfSample: FixtureMatrix;
  compositesInSample: FixtureMatrix;
  itemsOutOfSample: FixtureMatrix;
  itemsInSample: FixtureMatrix;
  lmOutOfSample: FixtureMatrix;
  lmInSample: FixtureMatrix;
  plsMetricsInSample: FixtureMatrix;
  plsMetricsOutOfSample: FixtureMatrix;
  lmMetricsInSample: FixtureMatrix;
  lmMetricsOutOfSample: FixtureMatrix;
  constructError: FixtureMatrix;
}

interface PredictCase {
  fixture: string;
  model: () => PlsModel;
  technique: PredictTechnique;
}

const cases: PredictCase[] = [
  { fixture: "M8_predict_m1_da", model: m1Model, technique: predictDA },
  { fixture: "M8_predict_m2_da", model: m2Model, technique: predictDA },
  { fixture: "M8_predict_m2_ea", model: m2Model, technique: predictEA },
  { fixture: "M8_predict_m4pi_da", model: m4piModel, technique: predictDA },
  { fixture: "M8_predict_m4ortho_da", model: m4orthoModel, technique: predictDA },
  { fixture: "M8_predict_m4ts_da", model: m4tsModel, technique: predictDA },
];

describe.each(cases)("predict_pls parity ($fixture)", ({ fixture, model, technique }) => {
  it("matches composite/item/LM predictions and metrics at 1e-5", async () => {
    const fx = await loadFixture<PredictFixture>(fixture);
    const ordering = fx.shuffleOrder[0]!.map((i) => i - 1); // R indices are 1-based
    const pred = predictPls(model(), { technique, noFolds: 10, ordering });

    expectMatrixClose(
      pred.composites.compositeOutOfSample,
      fx.compositesOutOfSample,
      PARITY_TOLERANCE,
      `${fixture}.compositesOOS`,
    );
    expectMatrixClose(
      pred.composites.compositeInSample,
      fx.compositesInSample,
      PARITY_TOLERANCE,
      `${fixture}.compositesIS`,
    );
    expectMatrixClose(pred.items.plsOutOfSample, fx.itemsOutOfSample, PARITY_TOLERANCE, `${fixture}.itemsOOS`);
    expectMatrixClose(pred.items.plsInSample, fx.itemsInSample, PARITY_TOLERANCE, `${fixture}.itemsIS`);
    expectMatrixClose(pred.items.lmOutOfSample, fx.lmOutOfSample, PARITY_TOLERANCE, `${fixture}.lmOOS`);
    expectMatrixClose(pred.items.lmInSample, fx.lmInSample, PARITY_TOLERANCE, `${fixture}.lmIS`);

    const summary = summarizePlsPredict(pred);
    expectMatrixClose(summary.plsInSample, fx.plsMetricsInSample, PARITY_TOLERANCE, `${fixture}.plsMetricsIS`);
    expectMatrixClose(summary.plsOutOfSample, fx.plsMetricsOutOfSample, PARITY_TOLERANCE, `${fixture}.plsMetricsOOS`);
    expectMatrixClose(summary.lmInSample, fx.lmMetricsInSample, PARITY_TOLERANCE, `${fixture}.lmMetricsIS`);
    expectMatrixClose(summary.lmOutOfSample, fx.lmMetricsOutOfSample, PARITY_TOLERANCE, `${fixture}.lmMetricsOOS`);
    expectMatrixClose(summary.constructError, fx.constructError, PARITY_TOLERANCE, `${fixture}.constructError`);
  });
});

describe("predictPls guards and defaults", () => {
  it("rejects higher-order models", () => {
    expect(() => predictPls(m5Model(), { noFolds: 10 })).toThrow(/higher-order/);
  });

  it("LOOCV (no noFolds) assigns each row its own fold", async () => {
    // 250 folds over 250 rows: prediction is deterministic given an ordering,
    // and every row gets an out-of-sample prediction.
    const fx = await loadFixture<PredictFixture>("M8_predict_m1_da");
    const ordering = fx.shuffleOrder[0]!.map((i) => i - 1);
    const pred = predictPls(m1Model(), { ordering });
    expect(pred.items.plsOutOfSample.values.every((row) => row.every(Number.isFinite))).toBe(true);
  });
});
