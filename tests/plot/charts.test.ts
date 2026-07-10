/**
 * Chart-plot tests (plot plan 6.1a): data extraction + SVG structure for the
 * four base-R-graphics result plots (plot_results.R + PLSpredict error
 * density). No pixel parity claim (plan D5) — series data, element counts,
 * labels, and the KDE bandwidth against R `bw.nrd0` reference values.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { loadMobi } from "../helpers/fixtures.ts";
import { m1Model } from "../evaluate/models.ts";
import { estimatePls, type PlsModel } from "../../src/estimate/estimatePls.ts";
import { composite, constructs, multiItems } from "../../src/specify/constructs.ts";
import { interactionTerm, orthogonal } from "../../src/specify/interactions.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { reliabilityTable } from "../../src/evaluate/reliability.ts";
import { predictPls } from "../../src/predict/predictPls.ts";
import { summarizePlsPredict } from "../../src/predict/metrics.ts";
import { nmGet } from "../../src/math/matrix.ts";
import { plotScores } from "../../src/plot/charts/scores.ts";
import { plotReliabilityTable } from "../../src/plot/charts/reliability.ts";
import { plotInteraction, slopeAnalysis, slopeSeries } from "../../src/plot/charts/slopes.ts";
import {
  densityEstimate,
  nrd0Bandwidth,
  plotPredictError,
} from "../../src/plot/charts/predictError.ts";
import {
  DEVICE_SIZE,
  MARGIN,
  SvgPlot,
  extendRange,
  prettyTicks,
} from "../../src/plot/charts/svg.ts";

const count = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

let model: PlsModel;
let moderatedModel: PlsModel;

beforeAll(async () => {
  const mobi = await loadMobi();
  model = m1Model();
  moderatedModel = estimatePls(
    mobi,
    constructs(
      composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      composite("Expectation", multiItems("CUEX", [1, 2, 3])),
      composite("Value", multiItems("PERV", [1, 2])),
      composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
      interactionTerm("Image", "Expectation", orthogonal),
    ),
    relationships(
      paths(["Image", "Expectation", "Value", "Image*Expectation"], "Satisfaction"),
    ),
  );
});

describe("plotScores", () => {
  test("pairs grid over all constructs", () => {
    const res = plotScores(model);
    expect(res).toBeInstanceOf(SvgPlot);
    const k = model.constructs.length;
    expect(count(res.svg, "<g data-panel=")).toBe(k * k);
    // diagonal panels carry the construct names
    for (const construct of model.constructs) {
      expect(res.svg).toContain(`>${construct}</text>`);
    }
  });

  test("construct subset", () => {
    const res = plotScores(model, ["Image", "Satisfaction"]);
    expect(count(res.svg, "<g data-panel=")).toBe(4);
  });

  test("off-diagonal scatter has n points", () => {
    const res = plotScores(model, ["Image", "Satisfaction"]);
    const n = model.constructScores.values.length;
    // 2 off-diagonal panels x n translucent points
    expect(count(res.svg, "<circle")).toBe(2 * n);
  });

  test("unknown construct throws", () => {
    expect(() => plotScores(model, ["Nope"])).toThrow("Unknown construct: Nope");
  });

  test("pairs()-style alternating outer axes with tick labels", () => {
    // R pairs(): x-axes on the bottom for odd 1-based columns, top for even;
    // y-axes on the right for odd 1-based rows, left for even.
    const res = plotScores(model, ["Image", "Expectation", "Value"]);
    expect(count(res.svg, 'data-axis="bottom"')).toBe(2); // columns 1, 3
    expect(count(res.svg, 'data-axis="top"')).toBe(1); // column 2
    expect(count(res.svg, 'data-axis="right"')).toBe(2); // rows 1, 3
    expect(count(res.svg, 'data-axis="left"')).toBe(1); // row 2
    // every axis group carries tick marks and numeric labels
    for (const side of ["bottom", "top", "right", "left"]) {
      const group = res.svg.split(`data-axis="${side}"`)[1]!.split("</g>")[0]!;
      expect(count(group, "<line")).toBeGreaterThan(1);
      expect(count(group, "<text")).toBeGreaterThan(1);
    }
  });
});

describe("plotReliabilityTable", () => {
  test("figure structure: threshold, tick labels, marker series", () => {
    const table = reliabilityTable(model);
    const res = plotReliabilityTable(table);
    expect(res.svg).toContain('data-threshold="0.708"');
    for (const construct of table.rows) {
      expect(res.svg).toContain(`>${construct}</text>`);
    }
    const n = table.rows.length;
    expect(count(res.svg, 'data-marker="alpha"')).toBe(n);
    expect(count(res.svg, 'data-marker="rhoA"')).toBe(n);
    expect(count(res.svg, 'data-marker="rhoC"')).toBe(n);
    // legend entries
    for (const label of ["alpha", "rhoA", "rhoC"]) {
      expect(res.svg).toContain(`>${label}</text>`);
    }
  });
});

describe("slopeAnalysis", () => {
  test("three lines match R's design-matrix computation", () => {
    const series = slopeSeries(moderatedModel, "Satisfaction", "Expectation", "Image");
    const b1 = nmGet(moderatedModel.pathCoef, "Image", "Satisfaction");
    const b3 = nmGet(moderatedModel.pathCoef, "Image*Expectation", "Satisfaction");
    const b2 = nmGet(moderatedModel.pathCoef, "Expectation", "Satisfaction");
    expect(series.lowModerator).toEqual([-b1 + b3 - b2, -b2, b1 - b3 - b2]);
    expect(series.meanModerator).toEqual([-b1, 0, b1]);
    expect(series.highModerator).toEqual([-b1 - b3 + b2, b2, b1 + b3 + b2]);
  });

  test("SVG carries three labeled series and axis labels", () => {
    const res = slopeAnalysis(moderatedModel, "Satisfaction", "Expectation", "Image");
    expect(count(res.svg, "data-series=")).toBe(3);
    expect(res.svg).toContain('data-series="Expectation at -1SD"');
    expect(res.svg).toContain('data-series="Expectation at Mean"');
    expect(res.svg).toContain('data-series="Expectation at +1SD"');
    expect(res.svg).toContain(">Image</text>");
    expect(res.svg).toContain(">Satisfaction</text>");
  });

  test("plotInteraction delegates by splitting the interaction name", () => {
    const direct = slopeAnalysis(moderatedModel, "Satisfaction", "Expectation", "Image");
    const via = plotInteraction(moderatedModel, "Image*Expectation", "Satisfaction");
    expect(via.svg).toBe(direct.svg);
    expect(() => plotInteraction(moderatedModel, "NoStar", "Satisfaction")).toThrow(
      "Not an interaction name",
    );
  });
});

describe("plotPredictError", () => {
  test("nrd0 bandwidth matches R bw.nrd0", () => {
    // R: bw.nrd0(c(1,2,3,4,5)) ; bw.nrd0(c(0.5,-1.2,0.3,2.4,-0.7,1.1,0.0,-2.2))
    expect(nrd0Bandwidth([1, 2, 3, 4, 5])).toBeCloseTo(0.973584622850636, 14);
    expect(nrd0Bandwidth([0.5, -1.2, 0.3, 2.4, -0.7, 1.1, 0.0, -2.2])).toBeCloseTo(
      0.653599534160827,
      14,
    );
  });

  test("density grid matches R's cut=3 endpoints and integrates to ~1", () => {
    const values = [0.5, -1.2, 0.3, 2.4, -0.7, 1.1, 0.0, -2.2];
    const { x, y, bandwidth } = densityEstimate(values);
    expect(x.length).toBe(512);
    // R: min/max of density(y)$x
    expect(x[0]!).toBeCloseTo(-4.16079860248248, 12);
    expect(x[511]!).toBeCloseTo(4.36079860248248, 12);
    expect(bandwidth).toBeCloseTo(0.653599534160827, 14);
    const step = x[1]! - x[0]!;
    const integral = y.reduce((sum, v) => sum + v * step, 0);
    expect(integral).toBeGreaterThan(0.99);
    expect(integral).toBeLessThan(1.01);
  });

  test("density figure has title, labels, and a 512-point curve", async () => {
    const prediction = predictPls(model, { noFolds: 5, seed: 42 });
    const summary = summarizePlsPredict(prediction);
    const res = plotPredictError(summary, "CUSA1");
    expect(res.svg).toContain("Distribution of predictive error of CUSA1");
    expect(res.svg).toContain("Bandwidth =");
    expect(res.svg).toContain(">Density</text>");
    const curve = res.svg.split('data-series="density"')[0]!.split("<polyline").pop()!;
    expect(count(curve, ",")).toBeGreaterThan(511);
  });

  test("curve keeps R's 4% axis-expansion gap from the frame", () => {
    // R plot() default xaxs/yaxs = "r": data limits extended 4% each side, so
    // the density peak sits below the frame top and tails clear the sides.
    const prediction = predictPls(model, { noFolds: 5, seed: 42 });
    const summary = summarizePlsPredict(prediction);
    const res = plotPredictError(summary, "CUSA1");
    const points = res.svg
      .split('data-series="density"')[0]!
      .split("<polyline")
      .pop()!
      .match(/points="([^"]+)"/)![1]!
      .split(" ")
      .map((pair) => pair.split(",").map(Number) as [number, number]);
    const frameTop = MARGIN.top;
    const frameLeft = MARGIN.left;
    const frameRight = DEVICE_SIZE - MARGIN.right;
    const plotHeight = DEVICE_SIZE - MARGIN.top - MARGIN.bottom;
    const peakY = Math.min(...points.map(([, y]) => y));
    // 4% of the plot height above the peak, 4% of the width beside the tails
    expect(peakY - frameTop).toBeGreaterThan(0.03 * plotHeight);
    expect(Math.min(...points.map(([x]) => x)) - frameLeft).toBeGreaterThan(5);
    expect(frameRight - Math.max(...points.map(([x]) => x))).toBeGreaterThan(5);
  });
});

describe("SvgPlot + prettyTicks", () => {
  test("extendRange mirrors R's xaxs = 'r' 4% expansion", () => {
    expect(extendRange([0, 1])).toEqual([-0.04, 1.04]);
    expect(extendRange([-2, 3])).toEqual([-2.2, 3.2]);
  });

  test("prettyTicks picks 1/2/5 steps inside the limits", () => {
    expect(prettyTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(prettyTicks(-1, 1)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(prettyTicks(0.7, 4.2)).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4]);
  });

  test("save() rejects non-svg extensions", () => {
    const p = new SvgPlot("<svg/>");
    expect(p.save("chart.png")).rejects.toThrow("Unsupported file type: 'png'");
  });
});
