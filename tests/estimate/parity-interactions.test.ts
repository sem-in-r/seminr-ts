import { describe, it, expect } from "bun:test";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import {
  interactionTerm,
  productIndicator,
  orthogonal,
  twoStage,
  type InteractionMethod,
} from "../../src/specify/interactions.ts";
import { constructs, composite, multiItems } from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import {
  loadFixture,
  loadMobi,
  expectMatrixClose,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";

interface M4Fixture {
  pathCoef: FixtureMatrix;
  outerLoadings: FixtureMatrix;
  outerWeights: FixtureMatrix;
  rSquared: FixtureMatrix;
  iterations: number;
}

const mobi = await loadMobi();
const sm = relationships(
  paths(["Image", "Expectation", "Value", "Image*Expectation"], "Satisfaction"),
);

function estimateVariant(method: InteractionMethod): ReturnType<typeof estimatePls> {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Value", multiItems("PERV", [1, 2])),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    interactionTerm("Image", "Expectation", method),
  );
  return estimatePls(mobi, mm, sm);
}

const variants: Array<[string, InteractionMethod]> = [
  ["M4_interaction_product_indicator", productIndicator],
  ["M4_interaction_orthogonal", orthogonal],
  ["M4_interaction_two_stage", twoStage],
];

describe.each(variants)("%s parity with seminr", (fixtureName, method) => {
  it("matches paths, loadings, weights, rSquared, iterations at 1e-5", async () => {
    const fx = await loadFixture<M4Fixture>(fixtureName);
    const model = estimateVariant(method);
    expectMatrixClose(model.pathCoef, fx.pathCoef, PARITY_TOLERANCE, `${fixtureName}.pathCoef`);
    expectMatrixClose(
      model.outerLoadings,
      fx.outerLoadings,
      PARITY_TOLERANCE,
      `${fixtureName}.outerLoadings`,
    );
    expectMatrixClose(
      model.outerWeights,
      fx.outerWeights,
      PARITY_TOLERANCE,
      `${fixtureName}.outerWeights`,
    );
    expectMatrixClose(model.rSquared, fx.rSquared, PARITY_TOLERANCE, `${fixtureName}.rSquared`);
    expect(model.iterations).toBe(fx.iterations);
  });
});
