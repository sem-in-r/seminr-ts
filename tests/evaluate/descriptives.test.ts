import { describe, it } from "bun:test";
import { descriptives } from "../../src/evaluate/descriptives.ts";
import {
  loadFixture,
  expectMatrixCloseNa,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import { evalModelCases } from "./models.ts";

interface EvalFixture {
  descriptives: {
    itemStatistics: FixtureMatrix;
    constructStatistics: FixtureMatrix;
    itemCorrelations: FixtureMatrix;
    constructCorrelations: FixtureMatrix;
  };
}

describe.each(evalModelCases)("descriptives parity ($fixture)", ({ fixture, model }) => {
  it("matches item/construct statistics and correlations at 1e-5", async () => {
    const fx = await loadFixture<EvalFixture>(fixture);
    const d = descriptives(model());

    expectMatrixCloseNa(
      d.statistics.items,
      fx.descriptives.itemStatistics,
      PARITY_TOLERANCE,
      `${fixture}.itemStatistics`,
    );
    expectMatrixCloseNa(
      d.statistics.constructs,
      fx.descriptives.constructStatistics,
      PARITY_TOLERANCE,
      `${fixture}.constructStatistics`,
    );
    expectMatrixCloseNa(
      d.correlations.items,
      fx.descriptives.itemCorrelations,
      PARITY_TOLERANCE,
      `${fixture}.itemCorrelations`,
    );
    expectMatrixCloseNa(
      d.correlations.constructs,
      fx.descriptives.constructCorrelations,
      PARITY_TOLERANCE,
      `${fixture}.constructCorrelations`,
    );
  });
});
