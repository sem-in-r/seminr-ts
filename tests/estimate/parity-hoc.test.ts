import { describe, it, expect } from "bun:test";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import { bootstrapModel } from "../../src/bootstrap/bootstrap.ts";
import { interactionTerm, twoStage } from "../../src/specify/interactions.ts";
import {
  constructs,
  composite,
  higherComposite,
  multiItems,
  singleItem,
} from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { mulberry32 } from "../../src/bootstrap/rng.ts";
import {
  loadFixture,
  loadMobi,
  expectMatrixClose,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";

interface ModelFixture {
  pathCoef: FixtureMatrix;
  outerLoadings: FixtureMatrix;
  outerWeights: FixtureMatrix;
  rSquared: FixtureMatrix;
  iterations: number;
  constructScoresHead: FixtureMatrix;
  firstStage?: {
    pathCoef: FixtureMatrix;
    outerWeights: FixtureMatrix;
    constructScoresHead: FixtureMatrix;
    iterations: number;
  };
}

const mobi = await loadMobi();

function m5Model(): ReturnType<typeof estimatePls> {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
    composite("Value", multiItems("PERV", [1, 2])),
    higherComposite("Satisfaction", ["Image", "Value"]),
    composite("Complaints", singleItem("CUSCO")),
    composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
  );
  const sm = relationships(
    paths(["Expectation", "Quality"], "Satisfaction"),
    paths("Satisfaction", ["Complaints", "Loyalty"]),
  );
  return estimatePls(mobi, mm, sm);
}

describe("M5 HOC two-stage parity with seminr", () => {
  it("matches stage-2 paths, combined loadings/weights, rSquared, and first-stage model", async () => {
    const fx = await loadFixture<ModelFixture>("M5_hoc_two_stage");
    const model = m5Model();

    expectMatrixClose(model.pathCoef, fx.pathCoef, PARITY_TOLERANCE, "M5.pathCoef");
    expectMatrixClose(model.outerLoadings, fx.outerLoadings, PARITY_TOLERANCE, "M5.outerLoadings");
    expectMatrixClose(model.outerWeights, fx.outerWeights, PARITY_TOLERANCE, "M5.outerWeights");
    expectMatrixClose(model.rSquared, fx.rSquared, PARITY_TOLERANCE, "M5.rSquared");
    expect(model.iterations).toBe(fx.iterations);

    expect(model.firstStageModel).toBeDefined();
    const fs = model.firstStageModel!;
    expectMatrixClose(fs.pathCoef, fx.firstStage!.pathCoef, PARITY_TOLERANCE, "M5.fs.pathCoef");
    expectMatrixClose(
      fs.outerWeights,
      fx.firstStage!.outerWeights,
      PARITY_TOLERANCE,
      "M5.fs.outerWeights",
    );
    expect(fs.iterations).toBe(fx.firstStage!.iterations);
  });
});

describe("M5b HOC + two-stage interaction parity with seminr", () => {
  it("matches paths, combined loadings/weights, rSquared", async () => {
    const fx = await loadFixture<ModelFixture>("M5b_hoc_two_stage_interaction");
    const mm = constructs(
      composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      composite("Expectation", multiItems("CUEX", [1, 2, 3])),
      composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5])),
      composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
      composite("Value", multiItems("PERV", [1, 2])),
      higherComposite("Nick", ["Quality", "Loyalty"]),
      composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
      interactionTerm("Image", "Expectation", twoStage),
    );
    const sm = relationships(
      paths(["Image", "Expectation", "Value", "Nick", "Image*Expectation"], "Satisfaction"),
    );
    const model = estimatePls(mobi, mm, sm);

    expectMatrixClose(model.pathCoef, fx.pathCoef, PARITY_TOLERANCE, "M5b.pathCoef");
    expectMatrixClose(model.outerLoadings, fx.outerLoadings, PARITY_TOLERANCE, "M5b.outerLoadings");
    expectMatrixClose(model.outerWeights, fx.outerWeights, PARITY_TOLERANCE, "M5b.outerWeights");
    expectMatrixClose(model.rSquared, fx.rSquared, PARITY_TOLERANCE, "M5b.rSquared");
  });
});

describe("HOC + bootstrap integration", () => {
  it("bootstraps a HOC model with fixed indices and matching dimensions", () => {
    const model = m5Model();
    const n = mobi.values.length;
    const rand = mulberry32(42);
    const indices = Array.from({ length: 5 }, () =>
      Array.from({ length: n }, () => Math.floor(rand() * n)),
    );
    const boot = bootstrapModel(model, { nboot: 5, indices });
    expect(boot.boots).toBe(5);
    expect(boot.bootPaths[0]!.rows).toEqual(model.pathCoef.rows);
    expect(boot.bootLoadings[0]!.rows).toEqual(model.outerLoadings.rows);
    expect(boot.bootWeights[0]!.cols).toEqual(model.outerWeights.cols);
  });
});
