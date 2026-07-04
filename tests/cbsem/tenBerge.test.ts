import { describe, it, expect } from "bun:test";
import { buildParTable } from "../../src/cbsem/partable.ts";
import { sampleCovariance } from "../../src/cbsem/sigma.ts";
import { fitMl } from "../../src/cbsem/mlFit.ts";
import { standardizedSolution } from "../../src/cbsem/standardize.ts";
import { tenBergeScores } from "../../src/cbsem/tenBerge.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { buildMmMatrix } from "../../src/model/mmMatrix.ts";
import { selectColumns } from "../../src/estimate/data.ts";
import { loadFixture, loadMobi } from "../helpers/fixtures.ts";
import { expectTestthatEqual, type CbsemFixture } from "./helpers.ts";

const mobi = await loadMobi();

const runModel = async (
  fixtureName: string,
  mm: ReturnType<typeof constructs>,
  am?: ReturnType<typeof associations>,
  sm?: ReturnType<typeof relationships>,
) => {
  const fx = await loadFixture<CbsemFixture>(fixtureName);
  const pt = buildParTable({
    mmMatrix: buildMmMatrix(mm),
    structuralModel: sm,
    itemAssociations: am,
  });
  const data = selectColumns(mobi, pt.observed);
  const s = sampleCovariance(data);
  const fit = fitMl(pt, s);
  const std = standardizedSolution(pt, fit.matrices);
  const tb = tenBergeScores(pt, fit.matrices, std, data);
  return { fx, pt, tb };
};

describe("tenBergeScores", () => {
  it("matches seminr's ten Berge weights and scores for the C3 doc CFA", async () => {
    const { fx, pt, tb } = await runModel(
      "cbsem-C3_cfa_doc",
      constructs(
        reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
        reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
        reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
      ),
      associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2")),
    );
    expect(tb.weights.rows).toEqual(fx.tenBerge.weights.rows);
    expect(tb.weights.cols).toEqual(fx.tenBerge.weights.cols);
    expectTestthatEqual(tb.weights.values, fx.tenBerge.weights);
    expect(tb.scores.columns).toEqual(pt.latents);
    expectTestthatEqual(tb.scores.values.slice(0, 5), fx.tenBerge.scoresHead);
    pt.latents.forEach((latent, j) => {
      const absMean =
        tb.scores.values.reduce((acc, row) => acc + Math.abs(row[j]!), 0) / tb.scores.values.length;
      expect(absMean).toBeCloseTo(fx.tenBerge.scoresAbsMean[latent]!, 5);
    });
  });

  it("matches seminr's ten Berge scores for the C3 ECSI SEM (endogenous latents)", async () => {
    const { fx, pt, tb } = await runModel(
      "cbsem-C3_ecsi",
      constructs(
        reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
        reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
        reflective("Value", multiItems("PERV", [1, 2])),
        reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
        reflective("Complaints", singleItem("CUSCO")),
        reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
      ),
      associations(itemErrors(["PERQ1", "PERQ2"], "IMAG1")),
      relationships(
        paths({ from: ["Image", "Quality"], to: ["Value", "Satisfaction"] }),
        paths({ from: ["Value", "Satisfaction"], to: ["Complaints", "Loyalty"] }),
        paths({ from: "Complaints", to: "Loyalty" }),
      ),
    );
    expectTestthatEqual(tb.weights.values, fx.tenBerge.weights, 5e-5);
    expectTestthatEqual(tb.scores.values.slice(0, 5), fx.tenBerge.scoresHead, 5e-5);
    pt.latents.forEach((latent, j) => {
      const absMean =
        tb.scores.values.reduce((acc, row) => acc + Math.abs(row[j]!), 0) / tb.scores.values.length;
      expect(absMean).toBeCloseTo(fx.tenBerge.scoresAbsMean[latent]!, 4);
    });
  });
});
