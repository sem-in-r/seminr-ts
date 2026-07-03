import { describe, it, expect } from "bun:test";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import { rhoA } from "../../src/estimate/consistent.ts";
import {
  constructs,
  composite,
  reflective,
  multiItems,
  regressionWeights,
} from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { nmGet } from "../../src/math/matrix.ts";
import {
  loadFixture,
  loadMobi,
  expectMatrixClose,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";

interface M3Fixture {
  pathCoef: FixtureMatrix;
  outerLoadings: FixtureMatrix;
  outerWeights: FixtureMatrix;
  rSquared: FixtureMatrix;
  iterations: number;
  rhoA: FixtureMatrix;
}

const mobi = await loadMobi();
const fx = await loadFixture<M3Fixture>("M3_reflective_plsc");

const reflectiveMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);
const sm = relationships(paths(["Image", "Expectation", "Value"], "Satisfaction"));

describe("rhoA (M3 fixture values)", () => {
  it("matches seminr's rho_A per construct", () => {
    const model = estimatePls(mobi, reflectiveMm, sm);
    const rho = rhoA(model, model.constructs);
    expectMatrixClose(rho, fx.rhoA, PARITY_TOLERANCE, "M3.rhoA");
  });
});

describe("M3 PLSc parity with seminr", () => {
  it("applies PLSc so paths, loadings, and rSquared match the fixture", () => {
    const model = estimatePls(mobi, reflectiveMm, sm);
    expectMatrixClose(model.pathCoef, fx.pathCoef, PARITY_TOLERANCE, "M3.pathCoef");
    expectMatrixClose(model.outerLoadings, fx.outerLoadings, PARITY_TOLERANCE, "M3.outerLoadings");
    expectMatrixClose(model.outerWeights, fx.outerWeights, PARITY_TOLERANCE, "M3.outerWeights");
    expectMatrixClose(model.rSquared, fx.rSquared, PARITY_TOLERANCE, "M3.rSquared");
    expect(model.iterations).toBe(fx.iterations);
  });

  it("differs from the uncorrected composite estimation", () => {
    const compositeMm = constructs(
      composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      composite("Expectation", multiItems("CUEX", [1, 2, 3])),
      composite("Value", multiItems("PERV", [1, 2])),
      composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    );
    const raw = estimatePls(mobi, compositeMm, sm);
    const corrected = estimatePls(mobi, reflectiveMm, sm);
    const diff = Math.abs(
      nmGet(raw.pathCoef, "Image", "Satisfaction") -
        nmGet(corrected.pathCoef, "Image", "Satisfaction"),
    );
    expect(diff).toBeGreaterThan(1e-3);
  });
});
