/**
 * Structural tests for CBSEM/CFA DOT diagrams (plot plan 5.1a).
 *
 * Net-new design ported from the py port: R seminr delegates these to semPlot,
 * so there is no R DOT to match — assertions are structural/unit-level on our
 * own engine's output (std loadings on mm edges, std paths + R² on the sm
 * part, and dashed non-constraining covariance edges), plus a real-wasm parse
 * smoke test.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { loadMobi } from "../helpers/fixtures.ts";
import { estimateCfa, type CfaModel } from "../../src/cbsem/estimateCfa.ts";
import { estimateCbsem, type CbsemModel } from "../../src/cbsem/estimateCbsem.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { constructs, multiItems, reflective } from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { nmGet } from "../../src/math/matrix.ts";
import { dotGraph } from "../../src/plot/dotGraph.ts";
import { plot, SeminrPlot } from "../../src/plot/plot.ts";
import { renderSvg } from "../../src/plot/render.ts";
import { rNum, rRound } from "../../src/plot/rFormat.ts";

let cfaModel: CfaModel;
let cbsemModel: CbsemModel;

beforeAll(async () => {
  const mobi = await loadMobi();
  cfaModel = estimateCfa(
    mobi,
    constructs(
      reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
      reflective("Value", multiItems("PERV", [1, 2])),
    ),
    undefined,
    { estimator: "ML" },
  );
  cbsemModel = estimateCbsem(
    mobi,
    constructs(
      reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
      reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    ),
    relationships(paths(["Image", "Expectation"], "Satisfaction")),
    associations(itemErrors("IMAG1", "CUEX2")),
    { estimator: "ML" },
  );
});

const rounded = (value: number): string => rNum(rRound(value, 3));

describe("CFA DOT", () => {
  test("is a digraph with construct nodes", () => {
    const dot = dotGraph(cfaModel);
    expect(dot.startsWith("digraph G {")).toBe(true);
    for (const construct of ["Image", "Expectation", "Value"]) {
      expect(dot).toContain(`"${construct}" [label=<<B>${construct} </B>>, shape = ellipse]`);
    }
  });

  test("mm edges carry std loadings", () => {
    const dot = dotGraph(cfaModel);
    const loading = rounded(nmGet(cfaModel.factorLoadings, "IMAG1", "Image"));
    expect(dot).toContain(`"IMAG1" -> {"Image"}[weight = 1000, label = < λ = ${loading} >`);
  });

  test("no structural edges", () => {
    // sm edges use weight = 1
    expect(dotGraph(cfaModel)).not.toContain("[weight = 1,");
  });

  test("factor covariance edges are dashed and non-constraining", () => {
    const dot = dotGraph(cfaModel);
    const latents = cfaModel.estimation.parTable.latents;
    const psi = cfaModel.estimation.std.psi;
    for (let i = 0; i < latents.length - 1; i++) {
      for (let j = i + 1; j < latents.length; j++) {
        const value = rounded(psi[i]![j]!);
        expect(dot).toContain(`"${latents[i]}" -> {"${latents[j]}"}[label = < ${value} >`);
      }
    }
    expect(dot).toContain("constraint = false");
    expect(dot).toContain("style = dashed");
  });

  test("covariance edges are bidirectional", () => {
    const covSection = dotGraph(cfaModel).split("// The covariances")[1]!;
    expect(covSection).toContain("arrowhead = normal");
    expect(covSection).toContain("arrowtail = normal");
  });

  test("plot() returns a SeminrPlot", () => {
    const res = plot(cfaModel);
    expect(res).toBeInstanceOf(SeminrPlot);
    expect(res.dot).toBe(dotGraph(cfaModel));
  });
});

describe("CBSEM DOT", () => {
  test("sm edges carry std paths", () => {
    const dot = dotGraph(cbsemModel);
    const beta = rounded(nmGet(cbsemModel.pathCoef, "Image", "Satisfaction"));
    expect(dot).toContain(`"Image" -> {"Satisfaction"}[weight = 1, label = < β = ${beta}`);
  });

  test("endogenous node shows R²", () => {
    const dot = dotGraph(cbsemModel);
    const r2 = rounded(cbsemModel.estimation.std.r2["Satisfaction"]!);
    expect(dot).toContain(
      `"Satisfaction" [label=<<B>Satisfaction </B><BR /><FONT POINT-SIZE='10'>R² = ${r2}</FONT>>, shape = ellipse]`,
    );
  });

  test("only exogenous factors have psi covariance edges", () => {
    const covSection = dotGraph(cbsemModel).split("// The covariances")[1]!;
    expect(covSection).toContain('"Image" -> {"Expectation"}');
    expect(covSection).not.toContain("Satisfaction");
  });

  test("item-error covariance edge renders", () => {
    const covSection = dotGraph(cbsemModel).split("// The covariances")[1]!;
    const observed = cbsemModel.estimation.parTable.observed;
    const theta = cbsemModel.estimation.std.theta;
    const value = rounded(theta[observed.indexOf("IMAG1")]![observed.indexOf("CUEX2")]!);
    expect(covSection).toContain(`"IMAG1" -> {"CUEX2"}[label = < ${value} >`);
  });

  test("measurement edges flip outward for the pure sink", () => {
    expect(dotGraph(cbsemModel)).toContain('"Satisfaction" -> {"CUSA1"}');
  });
});

describe("CBSEM/CFA DOT parses with Graphviz", () => {
  test("wasm dot layout succeeds for both models", async () => {
    for (const model of [cfaModel, cbsemModel]) {
      const svg = await renderSvg(dotGraph(model));
      expect(svg).toContain("<svg");
    }
  });
});
