import { describe, it, expect } from "bun:test";
import { estimatePls, naOmit } from "../../src/estimate/estimatePls.ts";
import { reportMissing } from "../../src/evaluate/summarizePls.ts";
import { missingDataReport } from "../../src/model/validate.ts";
import { MmMatrix } from "../../src/model/mmMatrix.ts";
import {
  constructs,
  composite,
  multiItems,
  regressionWeights,
} from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { nmGet, namedMatrix } from "../../src/math/matrix.ts";
import type { Dataset } from "../../src/estimate/data.ts";
import {
  loadFixture,
  loadMobi,
  expectMatrixClose,
  type FixtureMatrix,
} from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";

interface MissingFixture {
  pathCoef: FixtureMatrix;
  outerLoadings: FixtureMatrix;
  outerWeights: FixtureMatrix;
  rSquared: FixtureMatrix;
  iterations: number;
  n: number;
  constructScoresHead: FixtureMatrix;
  constructScoresAbsMean: Record<string, number>;
  missingReport: {
    method: string;
    nRemoved?: number;
    variables: string[];
    missingCounts: number[];
  };
}

const mm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Value", multiItems("PERV", [1, 2]), regressionWeights),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);
const sm = relationships(paths(["Image", "Expectation", "Value"], "Satisfaction"));

async function mobiWithMissing(): Promise<Dataset> {
  const mobi = await loadMobi();
  const values = mobi.values.map((row) => [...row]);
  const set = (row: number, column: string): void => {
    values[row]![mobi.columns.indexOf(column)] = Number.NaN;
  };
  set(2, "IMAG1"); // R rows 3, 7 for IMAG1; 15 CUEX2; 3, 22 PERV1 (1-based)
  set(6, "IMAG1");
  set(14, "CUEX2");
  set(2, "PERV1");
  set(21, "PERV1");
  return { columns: mobi.columns, values };
}

function expectMissingParity(
  model: ReturnType<typeof estimatePls>,
  fx: MissingFixture,
  label: string,
): void {
  expect(model.data.values.length).toBe(fx.n);
  expect(model.iterations).toBe(fx.iterations);
  expectMatrixClose(model.pathCoef, fx.pathCoef, PARITY_TOLERANCE, `${label}.pathCoef`);
  expectMatrixClose(model.outerLoadings, fx.outerLoadings, PARITY_TOLERANCE, `${label}.outerLoadings`);
  expectMatrixClose(model.outerWeights, fx.outerWeights, PARITY_TOLERANCE, `${label}.outerWeights`);
  expectMatrixClose(model.rSquared, fx.rSquared, PARITY_TOLERANCE, `${label}.rSquared`);

  const head = namedMatrix(
    ["1", "2", "3", "4", "5"],
    model.constructScores.cols,
    model.constructScores.values.slice(0, 5),
  );
  expectMatrixClose(head, fx.constructScoresHead, PARITY_TOLERANCE, `${label}.scoresHead`);
  for (const [col, expected] of Object.entries(fx.constructScoresAbsMean)) {
    const j = model.constructScores.cols.indexOf(col);
    const absMean =
      model.constructScores.values.reduce((s, row) => s + Math.abs(row[j]!), 0) /
      model.constructScores.values.length;
    expect(Math.abs(absMean - expected)).toBeLessThan(PARITY_TOLERANCE);
  }

  const report = reportMissing(model);
  expect(report.method).toBe(fx.missingReport.method);
  expect(report.nRemoved).toBe(fx.missingReport.nRemoved ?? undefined);
  expect(report.summary.map((s) => s.variable)).toEqual(fx.missingReport.variables);
  expect(report.summary.map((s) => s.missingCount)).toEqual(fx.missingReport.missingCounts);
}

describe("naOmit missing-data strategy (M10 parity)", () => {
  it("drops incomplete rows and matches seminr's na.omit estimates", async () => {
    const fx = await loadFixture<MissingFixture>("M10_missing_naomit");
    const model = estimatePls(await mobiWithMissing(), mm, sm, { missing: naOmit });
    expectMissingParity(model, fx, "M10.naomit");
    // rawdata keeps all rows; the cleaned estimation data drops the 4 incomplete ones
    expect(model.rawdata.values.length).toBe(250);
    expect(nmGet(model.rSquared, "Rsq", "Satisfaction")).toBeGreaterThan(0);
  });

  it("mean replacement over the same cells matches seminr", async () => {
    const fx = await loadFixture<MissingFixture>("M10_missing_meanrepl");
    const model = estimatePls(await mobiWithMissing(), mm, sm);
    expectMissingParity(model, fx, "M10.meanrepl");
  });
});

describe("missing-data warnings parity (evaluate_warnings.R)", () => {
  it("reports on the cleaned data, as seminr does after the strategy runs", async () => {
    const naModel = estimatePls(await mobiWithMissing(), mm, sm, { missing: naOmit });
    expect(naModel.warnings).toContain("All 246 observations are valid.");

    const mrModel = estimatePls(await mobiWithMissing(), mm, sm);
    expect(mrModel.warnings).toContain("All 250 observations are valid.");
  });

  it("lists incomplete rows with seminr's message text", () => {
    const mmMatrix = MmMatrix.fromRows([
      { construct: "X", measurement: "a", type: "A" },
      { construct: "X", measurement: "b", type: "A" },
    ]);
    const report = missingDataReport(
      [
        [1, 2],
        [Number.NaN, 2],
        [1, Number.NaN],
        [1, 2],
      ],
      ["a", "b"],
      mmMatrix,
    );
    expect(report).toBe(
      "Data rows 2, 3 contain missing values and will be omitted.\n" +
        "Total number of complete cases: 2",
    );
  });
});
