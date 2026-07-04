import { describe, it, expect } from "bun:test";
import { predict } from "../../src/predict/predict.ts";
import { predictDA, predictEA } from "../../src/predict/techniques.ts";
import {
  loadFixture,
  loadMobi,
  expectMatrixClose,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import {
  m2Model,
  m4piModel,
  m4orthoModel,
  m4tsModel,
  m5Model,
} from "../evaluate/models.ts";

interface DirectPredictCase {
  predictedItems: FixtureMatrix;
  itemResiduals: FixtureMatrix;
  predictedCompositeScores: FixtureMatrix;
  compositeResiduals: FixtureMatrix;
  actualStar: FixtureMatrix;
}

type DirectPredictFixture = Record<string, DirectPredictCase>;

const mobi = await loadMobi();
const testData = { columns: mobi.columns, values: mobi.values.slice(0, 20) };

const cases = [
  { key: "m2Da", model: m2Model, technique: predictDA },
  { key: "m2Ea", model: m2Model, technique: predictEA },
  { key: "m4piDa", model: m4piModel, technique: predictDA },
  { key: "m4orthoDa", model: m4orthoModel, technique: predictDA },
  { key: "m4tsDa", model: m4tsModel, technique: predictDA },
] as const;

describe("M12 direct out-of-sample predict parity (predict.seminr_model)", () => {
  for (const { key, model, technique } of cases) {
    it(`matches seminr for ${key}`, async () => {
      const fx = await loadFixture<DirectPredictFixture>("M12_direct_predict");
      const expected = fx[key]!;
      const pred = predict(model(), testData, { technique });
      expectMatrixClose(pred.predictedItems, expected.predictedItems, PARITY_TOLERANCE, `${key}.predictedItems`);
      expectMatrixClose(pred.itemResiduals, expected.itemResiduals, PARITY_TOLERANCE, `${key}.itemResiduals`);
      expectMatrixClose(
        pred.predictedCompositeScores,
        expected.predictedCompositeScores,
        PARITY_TOLERANCE,
        `${key}.predictedCompositeScores`,
      );
      expectMatrixClose(pred.compositeResiduals, expected.compositeResiduals, PARITY_TOLERANCE, `${key}.compositeResiduals`);
      expectMatrixClose(pred.actualStar, expected.actualStar, PARITY_TOLERANCE, `${key}.actualStar`);
    });
  }

  it("refuses higher-order models, as seminr", () => {
    expect(() => predict(m5Model(), testData)).toThrow(/higher-order/);
  });

  it("rejects out-of-range or duplicate testRowIndices", () => {
    const model = m2Model();
    const twoRows = { columns: mobi.columns, values: mobi.values.slice(0, 2) };
    expect(() => predict(model, twoRows, { testRowIndices: [0, 99999] })).toThrow(/testRowIndices/);
    expect(() => predict(model, twoRows, { testRowIndices: [1, 1] })).toThrow(/testRowIndices/);
    expect(() => predict(model, twoRows, { testRowIndices: [0] })).toThrow(/testRowIndices/);
  });
});
