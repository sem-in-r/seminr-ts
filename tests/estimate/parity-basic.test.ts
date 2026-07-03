import { describe, it, expect } from "bun:test";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import {
  constructs,
  composite,
  multiItems,
  singleItem,
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

interface ModelFixture {
  pathCoef: FixtureMatrix;
  outerLoadings: FixtureMatrix;
  outerWeights: FixtureMatrix;
  rSquared: FixtureMatrix;
  iterations: number;
  constructScoresHead: FixtureMatrix;
  constructScoresAbsMean: Record<string, number>;
  totalEffects?: FixtureMatrix;
}

const mobi = await loadMobi();

function expectModelMatchesFixture(
  model: ReturnType<typeof estimatePls>,
  fx: ModelFixture,
  label: string,
): void {
  expectMatrixClose(model.pathCoef, fx.pathCoef, PARITY_TOLERANCE, `${label}.pathCoef`);
  expectMatrixClose(model.outerLoadings, fx.outerLoadings, PARITY_TOLERANCE, `${label}.outerLoadings`);
  expectMatrixClose(model.outerWeights, fx.outerWeights, PARITY_TOLERANCE, `${label}.outerWeights`);
  expectMatrixClose(model.rSquared, fx.rSquared, PARITY_TOLERANCE, `${label}.rSquared`);
  expect(model.iterations).toBe(fx.iterations);

  // first five construct-score rows
  for (const [i, rowName] of fx.constructScoresHead.rows.entries()) {
    for (const [j, col] of fx.constructScoresHead.cols.entries()) {
      expect(
        Math.abs(nmGet(model.constructScores, rowName, col) - fx.constructScoresHead.values[i]![j]!),
        `${label}.constructScores[${rowName}, ${col}]`,
      ).toBeLessThan(PARITY_TOLERANCE);
    }
  }

  // full-matrix checksum: column means of |score|
  for (const [col, expected] of Object.entries(fx.constructScoresAbsMean)) {
    const j = model.constructScores.cols.indexOf(col);
    const absMean =
      model.constructScores.values.reduce((s, row) => s + Math.abs(row[j]!), 0) /
      model.constructScores.values.length;
    expect(Math.abs(absMean - expected), `${label}.absMean[${col}]`).toBeLessThan(PARITY_TOLERANCE);
  }
}

describe("M1 basic composite parity with seminr", () => {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Value", multiItems("PERV", [1, 2]), regressionWeights),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  );
  const sm = relationships(paths(["Image", "Expectation", "Value"], "Satisfaction"));

  it("matches all exported estimates at 1e-5", async () => {
    const fx = await loadFixture<ModelFixture>("M1_basic_composite");
    const model = estimatePls(mobi, mm, sm);
    expectModelMatchesFixture(model, fx, "M1");
  });
});

describe("M2 full ECSI parity with seminr", () => {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
    composite("Value", multiItems("PERV", [1, 2])),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    composite("Complaints", singleItem("CUSCO")),
    composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
  );
  const sm = relationships(
    paths("Image", ["Expectation", "Satisfaction", "Loyalty"]),
    paths("Expectation", ["Quality", "Value", "Satisfaction"]),
    paths("Quality", ["Value", "Satisfaction"]),
    paths("Value", ["Satisfaction"]),
    paths("Satisfaction", ["Complaints", "Loyalty"]),
    paths("Complaints", ["Loyalty"]),
  );

  it("matches all exported estimates at 1e-5", async () => {
    const fx = await loadFixture<ModelFixture>("M2_full_ecsi");
    const model = estimatePls(mobi, mm, sm);
    expectModelMatchesFixture(model, fx, "M2");
  });
});
