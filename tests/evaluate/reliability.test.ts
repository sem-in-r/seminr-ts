import { describe, it } from "bun:test";
import { reliabilityTable } from "../../src/evaluate/reliability.ts";
import { loadFixture, expectMatrixCloseNa, type FixtureMatrix } from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import { evalModelCases } from "./models.ts";

interface EvalFixture {
  reliability: FixtureMatrix;
}

describe.each(evalModelCases)("reliability table parity ($fixture)", ({ fixture, model }) => {
  it("matches alpha | rhoA | rhoC | AVE at 1e-5", async () => {
    const fx = await loadFixture<EvalFixture>(fixture);
    const table = reliabilityTable(model());
    expectMatrixCloseNa(table, fx.reliability, PARITY_TOLERANCE, `${fixture}.reliability`);
  });
});
