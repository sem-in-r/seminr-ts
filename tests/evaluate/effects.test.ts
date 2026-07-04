import { describe, it } from "bun:test";
import {
  modelFsquares,
  reportPaths,
  totalIndirectEffects,
  itCriteria,
} from "../../src/evaluate/effects.ts";
import { totalEffects } from "../../src/bootstrap/bootstrap.ts";
import {
  loadFixture,
  expectMatrixCloseNa,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import { evalModelCases } from "./models.ts";

interface EvalFixture {
  fSquare: FixtureMatrix;
  pathsReport: FixtureMatrix;
  totalEffects: FixtureMatrix;
  totalIndirectEffects: FixtureMatrix;
  itCriteria: FixtureMatrix;
}

describe.each(evalModelCases)("effects parity ($fixture)", ({ fixture, model }) => {
  it("matches paths report, fSquare, total (indirect) effects, AIC/BIC at 1e-5", async () => {
    const fx = await loadFixture<EvalFixture>(fixture);
    const m = model();

    expectMatrixCloseNa(reportPaths(m), fx.pathsReport, PARITY_TOLERANCE, `${fixture}.pathsReport`);
    expectMatrixCloseNa(
      totalEffects(m.pathCoef),
      fx.totalEffects,
      PARITY_TOLERANCE,
      `${fixture}.totalEffects`,
    );
    expectMatrixCloseNa(
      totalIndirectEffects(m.pathCoef),
      fx.totalIndirectEffects,
      PARITY_TOLERANCE,
      `${fixture}.totalIndirectEffects`,
    );
    expectMatrixCloseNa(itCriteria(m), fx.itCriteria, PARITY_TOLERANCE, `${fixture}.itCriteria`);
    expectMatrixCloseNa(modelFsquares(m), fx.fSquare, PARITY_TOLERANCE, `${fixture}.fSquare`);
  });
});
