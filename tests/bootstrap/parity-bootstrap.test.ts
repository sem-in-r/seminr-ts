import { describe, it, expect } from "bun:test";
import { bootstrapModel, totalEffects, bootTValues, bootPercentileCIs } from "../../src/bootstrap/bootstrap.ts";
import { bootstrapModelParallel } from "../../src/bootstrap/parallel.ts";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import {
  constructs,
  composite,
  multiItems,
  singleItem,
  regressionWeights,
} from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { nmGet, namedMatrix } from "../../src/math/matrix.ts";
import { quantile } from "../../src/math/stats.ts";
import {
  loadFixture,
  loadMobi,
  expectMatrixClose,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";

const mobi = await loadMobi();

const m1Mm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Value", multiItems("PERV", [1, 2]), regressionWeights),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);
const m1Sm = relationships(paths(["Image", "Expectation", "Value"], "Satisfaction"));

interface M6Fixture {
  boots: number;
  pathsDescriptives: FixtureMatrix;
  loadingsDescriptives: FixtureMatrix;
  weightsDescriptives: FixtureMatrix;
  totalPathsDescriptives: FixtureMatrix;
}

interface BootIndicesFixture {
  settings: { nboot: number; n: number };
  indices: number[][];
}

async function loadBootIndices(): Promise<number[][]> {
  const url = new URL("../fixtures/expected/boot_indices.json", import.meta.url);
  const fx = JSON.parse(await Bun.file(url).text()) as BootIndicesFixture;
  // R indices are 1-based
  return fx.indices.map((row) => row.map((i) => i - 1));
}

describe("M6 bootstrap parity with seminr (R-exported resample indices)", () => {
  it("matches paths/loadings/weights/total-paths descriptives at 1e-5", async () => {
    const fx = await loadFixture<M6Fixture>("M6_bootstrap");
    const model = estimatePls(mobi, m1Mm, m1Sm);
    const boot = bootstrapModel(model, { nboot: 200, indices: await loadBootIndices() });

    expect(boot.boots).toBe(fx.boots);
    expectMatrixClose(boot.pathsDescriptives, fx.pathsDescriptives, PARITY_TOLERANCE, "M6.paths");
    expectMatrixClose(
      boot.loadingsDescriptives,
      fx.loadingsDescriptives,
      PARITY_TOLERANCE,
      "M6.loadings",
    );
    expectMatrixClose(
      boot.weightsDescriptives,
      fx.weightsDescriptives,
      PARITY_TOLERANCE,
      "M6.weights",
    );
    expectMatrixClose(
      boot.totalPathsDescriptives,
      fx.totalPathsDescriptives,
      PARITY_TOLERANCE,
      "M6.totalPaths",
    );
  });

  it("matches the same descriptives when run across Web Workers", async () => {
    const fx = await loadFixture<M6Fixture>("M6_bootstrap");
    const model = estimatePls(mobi, m1Mm, m1Sm);
    const boot = await bootstrapModelParallel(model, {
      nboot: 200,
      indices: await loadBootIndices(),
      workers: 4,
    });

    expect(boot.boots).toBe(fx.boots);
    expectMatrixClose(boot.pathsDescriptives, fx.pathsDescriptives, PARITY_TOLERANCE, "M6w.paths");
    expectMatrixClose(
      boot.loadingsDescriptives,
      fx.loadingsDescriptives,
      PARITY_TOLERANCE,
      "M6w.loadings",
    );
    expectMatrixClose(
      boot.weightsDescriptives,
      fx.weightsDescriptives,
      PARITY_TOLERANCE,
      "M6w.weights",
    );
    expectMatrixClose(
      boot.totalPathsDescriptives,
      fx.totalPathsDescriptives,
      PARITY_TOLERANCE,
      "M6w.totalPaths",
    );
  });
});

describe("totalEffects on M2 (fixture)", () => {
  it("matches seminr's total_effects at 1e-5", async () => {
    const fx = await loadFixture<{ totalEffects: FixtureMatrix }>("M2_full_ecsi");
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
    const model = estimatePls(mobi, mm, sm);
    expectMatrixClose(totalEffects(model.pathCoef), fx.totalEffects, PARITY_TOLERANCE, "M2.total");
  });
});

describe("boot summaries", () => {
  it("t-values are PLS estimate over boot SD", async () => {
    const fx = await loadFixture<M6Fixture>("M6_bootstrap");
    const model = estimatePls(mobi, m1Mm, m1Sm);
    const boot = bootstrapModel(model, { nboot: 200, indices: await loadBootIndices() });
    const t = bootTValues(boot.pathsDescriptives);
    const d = fx.pathsDescriptives;
    const est = d.values[0]![d.cols.indexOf("Satisfaction PLS Est.")]!;
    const sd = d.values[0]![d.cols.indexOf("Satisfaction Boot SD")]!;
    expect(nmGet(t, "Image", "Satisfaction")).toBeCloseTo(est / sd, 4);
  });

  it("percentile CIs use R type-7 quantiles over the boot distribution", () => {
    // stub 3 replications with known values in one cell
    const reps = [0.1, 0.2, 0.4].map((v) => namedMatrix(["A"], ["B"], [[v]]));
    const ci = bootPercentileCIs(reps, 0.1);
    expect(nmGet(ci.lower, "A", "B")).toBeCloseTo(quantile([0.1, 0.2, 0.4], 0.05), 12);
    expect(nmGet(ci.upper, "A", "B")).toBeCloseTo(quantile([0.1, 0.2, 0.4], 0.95), 12);
  });
});
