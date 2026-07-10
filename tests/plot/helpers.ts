/**
 * Shared helpers for DOT-plot parity tests: fixture loading and model builders.
 *
 * The `tests/fixtures/plots/*.dot` files are R-generated golden fixtures (see
 * `scripts/generate-plot-fixtures.R`); exact string parity is the contract.
 * Model builders mirror the generator script's models.
 */

import { expect } from "bun:test";
import { loadMobi } from "../helpers/fixtures.ts";
import { m1Model } from "../evaluate/models.ts";
import { estimatePls, type PlsModel } from "../../src/estimate/estimatePls.ts";
import { bootstrapModel, type BootModel } from "../../src/bootstrap/bootstrap.ts";
import {
  composite,
  constructs,
  correlationWeights,
  higherComposite,
  modeB,
  multiItems,
  reflective,
  regressionWeights,
  singleItem,
  unitWeights,
} from "../../src/specify/constructs.ts";
import { interactionTerm, productIndicator } from "../../src/specify/interactions.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";

const plotsUrl = (name: string): URL =>
  new URL(`../fixtures/plots/${name}.dot`, import.meta.url);

/** Fixture DOT text without the trailing newline writeLines() appended. */
export async function loadPlotFixture(name: string): Promise<string> {
  const text = await Bun.file(plotsUrl(name)).text();
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

export async function expectDotEqual(dot: string, fixtureName: string): Promise<void> {
  const expected = await loadPlotFixture(fixtureName);
  expect(dot.split("\n")).toEqual(expected.split("\n"));
  expect(dot).toBe(expected);
}

export const ECSI_SM = relationships(
  paths("Image", ["Expectation", "Satisfaction", "Loyalty"]),
  paths("Expectation", ["Quality", "Value", "Satisfaction"]),
  paths("Quality", ["Value", "Satisfaction"]),
  paths("Value", ["Satisfaction"]),
  paths("Satisfaction", ["Complaints", "Loyalty"]),
  paths("Complaints", ["Loyalty"]),
);

export function mixedMm() {
  return constructs(
    reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3]), unitWeights),
    composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7]), correlationWeights),
    composite("Value", multiItems("PERV", [1, 2]), regressionWeights),
    reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    reflective("Complaints", singleItem("CUSCO")),
    reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
  );
}

let basicCache: PlsModel | undefined;

export async function basicReflectiveModel(): Promise<PlsModel> {
  if (basicCache) return basicCache;
  const mm = constructs(
    reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
    reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
    reflective("Value", multiItems("PERV", [1, 2])),
    reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    reflective("Complaints", singleItem("CUSCO")),
    reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
  );
  basicCache = estimatePls(await loadMobi(), mm, ECSI_SM);
  return basicCache;
}

let mixedCache: PlsModel | undefined;

export async function mixedCompositeModel(): Promise<PlsModel> {
  mixedCache ??= estimatePls(await loadMobi(), mixedMm(), ECSI_SM);
  return mixedCache;
}

let interactionCache: PlsModel | undefined;

export async function interactionModel(): Promise<PlsModel> {
  if (interactionCache) return interactionCache;
  const mm = constructs(
    reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
    reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
    reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
    interactionTerm("Quality", "Expectation", productIndicator),
  );
  const sm = relationships(
    paths(["Image", "Quality", "Expectation", "Quality*Expectation"], "Loyalty"),
  );
  interactionCache = estimatePls(await loadMobi(), mm, sm);
  return interactionCache;
}

let hocCache: PlsModel | undefined;

export async function hocModel(): Promise<PlsModel> {
  if (hocCache) return hocCache;
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5])),
    composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
    composite("Value", multiItems("PERV", [1, 2])),
    higherComposite("Nick", ["Quality", "Loyalty"], "two_stage", modeB),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  );
  const sm = relationships(
    paths(["Image", "Expectation", "Value", "Nick"], "Satisfaction"),
  );
  hocCache = estimatePls(await loadMobi(), mm, sm);
  return hocCache;
}

interface BootIndicesFixture {
  indices: number[][];
}

let bootCache: BootModel | undefined;

/** The M6 bootstrap (M1, nboot=200, seed=123 in R), rebuilt from R's resample indices. */
export async function m6Boot(): Promise<BootModel> {
  if (bootCache) return bootCache;
  const url = new URL("../fixtures/expected/boot_indices.json", import.meta.url);
  const fx = JSON.parse(await Bun.file(url).text()) as BootIndicesFixture;
  const indices = fx.indices.map((row) => row.map((i) => i - 1)); // R indices are 1-based
  bootCache = bootstrapModel(m1Model(), { nboot: 200, indices });
  return bootCache;
}
