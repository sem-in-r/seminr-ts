import { describe, it, expect } from "bun:test";
import { bootstrapModel } from "../../src/bootstrap/bootstrap.ts";
import { summarizePlsBoot } from "../../src/bootstrap/summarize.ts";
import { summarize } from "../../src/cbsem/summarize.ts";
import {
  loadFixture,
  expectMatrixClose,
  expectMatrixCloseNa,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import { m1Model, m2Model } from "../evaluate/models.ts";

interface BootSummaryFixture {
  paths: FixtureMatrix;
  weights: FixtureMatrix;
  loadings: FixtureMatrix;
  htmt: FixtureMatrix;
  totalPaths: FixtureMatrix;
  totalIndirectPaths: FixtureMatrix | string;
}

interface BootFixture {
  boots: number;
  pathsDescriptives: FixtureMatrix;
  HTMTDescriptives: FixtureMatrix;
  bootSummary: BootSummaryFixture;
}

interface BootIndicesFixture {
  settings: { nboot: number; n: number };
  indices: number[][];
}

async function loadIndices(name: string): Promise<number[][]> {
  const url = new URL(`../fixtures/expected/${name}.json`, import.meta.url);
  const fx = JSON.parse(await Bun.file(url).text()) as BootIndicesFixture;
  return fx.indices.map((row) => row.map((i) => i - 1)); // R indices are 1-based
}

describe("M6 bootstrap HTMT + summary parity (R-exported resample indices)", () => {
  it("carries HTMT through the bootstrap and matches all summary tables", async () => {
    const fx = await loadFixture<BootFixture>("M6_bootstrap");
    const boot = bootstrapModel(m1Model(), { nboot: 200, indices: await loadIndices("boot_indices") });

    expect(boot.bootHtmt.length).toBe(fx.boots);
    expectMatrixCloseNa(
      boot.htmtDescriptives,
      fx.HTMTDescriptives,
      PARITY_TOLERANCE,
      "M6.htmtDescriptives",
    );

    const summary = summarizePlsBoot(boot);
    expect(summary.nboot).toBe(fx.boots);
    expectMatrixCloseNa(summary.bootstrappedPaths, fx.bootSummary.paths, PARITY_TOLERANCE, "M6.bs.paths");
    expectMatrixCloseNa(summary.bootstrappedWeights, fx.bootSummary.weights, PARITY_TOLERANCE, "M6.bs.weights");
    expectMatrixCloseNa(summary.bootstrappedLoadings, fx.bootSummary.loadings, PARITY_TOLERANCE, "M6.bs.loadings");
    expectMatrixCloseNa(summary.bootstrappedHtmt, fx.bootSummary.htmt, PARITY_TOLERANCE, "M6.bs.htmt");
    expectMatrixCloseNa(summary.bootstrappedTotalPaths, fx.bootSummary.totalPaths, PARITY_TOLERANCE, "M6.bs.totalPaths");

    // M1 has no indirect effects
    expect(fx.bootSummary.totalIndirectPaths).toBe("No indirect effects");
    expect(summary.bootstrappedTotalIndirectPaths).toBeNull();
  });

  it("is dispatched by summarize() on kind === 'boot'", async () => {
    const boot = bootstrapModel(m1Model(), { nboot: 20, indices: (await loadIndices("boot_indices")).slice(0, 20) });
    const summary = summarize(boot);
    expect(summary.nboot).toBe(20);
    expect(summary.bootstrappedPaths.cols).toContain("T Stat.");
  });
});

describe("M6b ECSI bootstrap summary parity (total indirect paths)", () => {
  it("matches descriptives and all boot summary tables incl. total indirect paths", async () => {
    const fx = await loadFixture<BootFixture>("M6b_bootstrap_ecsi");
    const boot = bootstrapModel(m2Model(), { nboot: 100, indices: await loadIndices("boot_indices_m2") });

    expect(boot.boots).toBe(fx.boots);
    expectMatrixClose(boot.pathsDescriptives, fx.pathsDescriptives, PARITY_TOLERANCE, "M6b.paths");
    expectMatrixCloseNa(
      boot.htmtDescriptives,
      fx.HTMTDescriptives,
      PARITY_TOLERANCE,
      "M6b.htmtDescriptives",
    );

    const summary = summarizePlsBoot(boot);
    expectMatrixCloseNa(summary.bootstrappedPaths, fx.bootSummary.paths, PARITY_TOLERANCE, "M6b.bs.paths");
    expectMatrixCloseNa(summary.bootstrappedWeights, fx.bootSummary.weights, PARITY_TOLERANCE, "M6b.bs.weights");
    expectMatrixCloseNa(summary.bootstrappedLoadings, fx.bootSummary.loadings, PARITY_TOLERANCE, "M6b.bs.loadings");
    expectMatrixCloseNa(summary.bootstrappedHtmt, fx.bootSummary.htmt, PARITY_TOLERANCE, "M6b.bs.htmt");
    expectMatrixCloseNa(summary.bootstrappedTotalPaths, fx.bootSummary.totalPaths, PARITY_TOLERANCE, "M6b.bs.totalPaths");
    expectMatrixCloseNa(
      summary.bootstrappedTotalIndirectPaths!,
      fx.bootSummary.totalIndirectPaths as FixtureMatrix,
      PARITY_TOLERANCE,
      "M6b.bs.totalIndirectPaths",
    );
  });
});
