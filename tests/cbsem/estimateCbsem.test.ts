import { describe, it, expect } from "bun:test";
import { estimateCfa } from "../../src/cbsem/estimateCfa.ts";
import { estimateCbsem } from "../../src/cbsem/estimateCbsem.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { higherReflective } from "../../src/specify/reflective.ts";
import { interactionTerm, productIndicator, twoStage } from "../../src/specify/interactions.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { loadFixture, loadMobi } from "../helpers/fixtures.ts";
import { expectTestthatEqual, type CbsemFixture } from "./helpers.ts";

const mobi = await loadMobi();

const expectScoresMatch = (
  model: { constructScores: { columns: string[]; values: number[][] } },
  fx: CbsemFixture,
  tol = 1e-5,
) => {
  expect(model.constructScores.columns).toEqual(fx.tenBerge.scoresHead.cols);
  expectTestthatEqual(model.constructScores.values.slice(0, 5), fx.tenBerge.scoresHead, tol);
  model.constructScores.columns.forEach((name, j) => {
    const absMean =
      model.constructScores.values.reduce((acc, row) => acc + Math.abs(row[j]!), 0) /
      model.constructScores.values.length;
    expect(absMean).toBeCloseTo(fx.tenBerge.scoresAbsMean[name]!, 4);
  });
};

describe("estimateCfa", () => {
  it("reproduces the C4 first-stage CFA end-to-end", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C4_first_stage_cfa");
    const model = estimateCfa(
      mobi,
      constructs(
        reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
        reflective("Expectation", singleItem("CUEX3")),
        reflective("Value", multiItems("PERV", [1, 2])),
        reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
      ),
    );
    expect(model.lavaanModel).toBe(fx.lavaanModel);
    expect(model.constructs).toEqual(["Image", "Expectation", "Value", "Satisfaction"]);
    expect(model.factorLoadings.rows).toEqual(fx.factorLoadings.rows!);
    expectTestthatEqual(model.factorLoadings.values, fx.factorLoadings);
    expectTestthatEqual(model.itemWeights.values, fx.tenBerge.weights);
    expectScoresMatch(model, fx);
  });
});

describe("estimateCbsem: C2 demo (product indicator interaction)", () => {
  const c1Mm = constructs(
    reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
    reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
    reflective("Value", multiItems("PERV", [1, 2])),
    reflective("Complaints", singleItem("CUSCO")),
  );
  const c2Mm = [...c1Mm, interactionTerm({ iv: "Image", moderator: "Expectation", method: productIndicator })];
  const c2Sm = relationships(
    paths({ from: ["Image", "Expectation"], to: ["Value", "Loyalty"] }),
    paths({ from: ["Complaints", "Image*Expectation"], to: "Loyalty" }),
  );
  const c1Am = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

  it("matches the seminr/lavaan fixture", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C2_demo_pi_interaction");
    const model = estimateCbsem(mobi, c2Mm, c2Sm, c1Am);

    expect(model.lavaanModel).toBe(fx.lavaanModel);
    // generated product-indicator columns (lavaanified)
    const intxnCols = model.data.columns.filter((c) => !mobi.columns.includes(c));
    expect(intxnCols).toEqual(fx.interactionItemNames!);

    expectTestthatEqual(model.estimation.fit.matrices.lambda, fx.ml.unstd.lambda, 5e-5);
    expectTestthatEqual(model.estimation.fit.matrices.beta!, fx.ml.unstd.beta!, 5e-5);
    expectTestthatEqual(model.estimation.fit.matrices.psi, fx.ml.unstd.psi, 5e-5);
    expectTestthatEqual(model.estimation.fit.matrices.theta, fx.ml.unstd.theta, 5e-5);

    expect(model.pathCoef.rows).toEqual(fx.pathCoef!.rows!);
    expect(model.pathCoef.cols).toEqual(fx.pathCoef!.cols);
    expectTestthatEqual(model.pathCoef.values, fx.pathCoef!, 5e-5);

    expectTestthatEqual(model.itemWeights.values, fx.tenBerge.weights, 5e-5);
    expectScoresMatch(model, fx, 5e-5);
  });
});

describe("estimateCbsem: C4 interaction models", () => {
  const partialMm = constructs(
    reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    reflective("Expectation", singleItem("CUEX3")),
    reflective("Value", multiItems("PERV", [1, 2])),
    reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  );
  const c4Sm = relationships(
    paths({ from: ["Image", "Expectation", "Value", "Image*Expectation"], to: "Satisfaction" }),
  );

  it("product indicator variant matches", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C4_intxn_pi");
    const mm = [...partialMm, interactionTerm({ iv: "Image", moderator: "Expectation", method: productIndicator })];
    const model = estimateCbsem(mobi, mm, c4Sm);
    expect(model.lavaanModel).toBe(fx.lavaanModel);
    expectTestthatEqual(model.factorLoadings.values, fx.factorLoadings, 5e-5);
    expectTestthatEqual(model.pathCoef.values, fx.pathCoef!, 5e-5);
    expectScoresMatch(model, fx, 5e-5);
  });

  it("two-stage variant matches (first-stage ten Berge product column)", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C4_intxn_2stage");
    const mm = [...partialMm, interactionTerm({ iv: "Image", moderator: "Expectation", method: twoStage })];
    const model = estimateCbsem(mobi, mm, c4Sm);
    expect(model.lavaanModel).toBe(fx.lavaanModel);

    const intxnCols = model.data.columns.filter((c) => !mobi.columns.includes(c));
    expect(intxnCols).toEqual(["Image_x_Expectation_intxn"]);
    const colIdx = model.data.columns.indexOf("Image_x_Expectation_intxn");
    const head = model.data.values.slice(0, 5).map((row) => [row[colIdx]!]);
    expectTestthatEqual(head, fx.interactionDataHead!, 5e-5);

    expectTestthatEqual(model.factorLoadings.values, fx.factorLoadings, 5e-5);
    expectTestthatEqual(model.pathCoef.values, fx.pathCoef!, 5e-5);
    expectScoresMatch(model, fx, 5e-5);
  });
});

describe("estimateCbsem: C5 higher-order (higher_reflective)", () => {
  it("matches combined loadings and paths", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C5_hoc");
    const mm = constructs(
      reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
      higherReflective("ImageSat", ["Image", "Satisfaction"]),
      reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
      reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
    );
    const sm = relationships(
      paths({ from: ["ImageSat", "Satisfaction", "Expectation"], to: "Loyalty" }),
    );
    const model = estimateCbsem(mobi, mm, sm);
    expect(model.lavaanModel).toBe(fx.lavaanModel);
    expect(model.factorLoadings.rows).toEqual(fx.factorLoadings.rows!);
    expect(model.factorLoadings.cols).toEqual(fx.factorLoadings.cols);
    expectTestthatEqual(model.factorLoadings.values, fx.factorLoadings, 5e-5);
    expectTestthatEqual(model.pathCoef.values, fx.pathCoef!, 5e-5);
    expectScoresMatch(model, fx, 5e-5);
  });
});
