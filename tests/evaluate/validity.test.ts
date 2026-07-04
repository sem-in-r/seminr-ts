import { describe, it } from "bun:test";
import {
  htmt,
  flCriteriaTable,
  crossLoadings,
  itemVifs,
  plsAntecedentVifs,
} from "../../src/evaluate/validity.ts";
import { constructsInModel } from "../../src/evaluate/constructsInModel.ts";
import {
  loadFixture,
  expectMatrixCloseNa,
  expectRecordClose,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import { evalModelCases } from "./models.ts";

interface EvalFixture {
  htmt: FixtureMatrix;
  flCriteria: FixtureMatrix;
  crossLoadings: FixtureMatrix;
  itemVifs: Record<string, Record<string, number | null>>;
  antecedentVifs: Record<string, Record<string, number | null>>;
}

describe.each(evalModelCases)("validity parity ($fixture)", ({ fixture, model }) => {
  it("matches HTMT, FL criteria, cross-loadings, and VIFs at 1e-5", async () => {
    const fx = await loadFixture<EvalFixture>(fixture);
    const m = model();
    const mc = constructsInModel(m);

    expectMatrixCloseNa(htmt(m), fx.htmt, PARITY_TOLERANCE, `${fixture}.htmt`);
    expectMatrixCloseNa(
      flCriteriaTable(m, mc),
      fx.flCriteria,
      PARITY_TOLERANCE,
      `${fixture}.flCriteria`,
    );
    expectMatrixCloseNa(
      crossLoadings(m, mc),
      fx.crossLoadings,
      PARITY_TOLERANCE,
      `${fixture}.crossLoadings`,
    );
    expectRecordClose(itemVifs(m, mc), fx.itemVifs, PARITY_TOLERANCE, `${fixture}.itemVifs`);
    expectRecordClose(
      plsAntecedentVifs(m, mc),
      fx.antecedentVifs,
      PARITY_TOLERANCE,
      `${fixture}.antecedentVifs`,
    );
  });
});
