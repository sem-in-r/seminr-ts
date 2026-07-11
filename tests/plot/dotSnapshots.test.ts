/**
 * DOT snapshot parity tests for estimated PLS models (plot plan 1.4a/1.5a).
 *
 * Each test compares `dotGraph()` output byte-for-byte against the R-generated
 * fixture in `tests/fixtures/plots/` (which the generator script asserted
 * equal to seminr's committed testthat snapshots).
 */

import { describe, test } from "bun:test";
import { dotGraph } from "../../src/plot/dotGraph.ts";
import {
  seminrThemeAcademic,
  seminrThemeCreate,
  seminrThemeDark,
  seminrThemeSmart,
} from "../../src/plot/theme.ts";
import {
  basicReflectiveModel,
  expectDotEqual,
  hocModel,
  interactionModel,
  mixedCompositeModel,
} from "./helpers.ts";

describe("estimated PLS snapshots", () => {
  test("basic all-reflective ECSI", async () => {
    await expectDotEqual(dotGraph(await basicReflectiveModel()), "estimated_basic_reflective");
  });

  test("mixed reflective and composite", async () => {
    await expectDotEqual(dotGraph(await mixedCompositeModel()), "estimated_mixed_composite");
  });

  test("product-indicator interaction", async () => {
    await expectDotEqual(dotGraph(await interactionModel()), "estimated_interaction");
  });

  test("higher-order composite", async () => {
    await expectDotEqual(dotGraph(await hocModel()), "estimated_hoc");
  });

  test("title option", async () => {
    await expectDotEqual(
      dotGraph(await basicReflectiveModel(), { title: "PLS-Model plot" }),
      "estimated_basic_title",
    );
  });
});

describe("theme variant snapshots", () => {
  test("academic", async () => {
    await expectDotEqual(
      dotGraph(await basicReflectiveModel(), { theme: seminrThemeAcademic() }),
      "theme_academic",
    );
  });

  test("smart", async () => {
    await expectDotEqual(
      dotGraph(await basicReflectiveModel(), { theme: seminrThemeSmart() }),
      "theme_smart",
    );
  });

  test("dark", async () => {
    await expectDotEqual(
      dotGraph(await basicReflectiveModel(), { theme: seminrThemeDark() }),
      "theme_dark",
    );
  });

  test("custom", async () => {
    const custom = seminrThemeCreate({
      plotAdj: true,
      plotSpecialcharacters: false,
      plotRounding: 2,
      plotTitleFontsize: 30,
      plotBgcolor: "white",
      smEdgeLabelAllBetas: false,
      smNodeFill: "lightcyan",
      mmEdgeLabelShow: false,
    });
    await expectDotEqual(
      dotGraph(await basicReflectiveModel(), { title: "Custom theme", theme: custom }),
      "theme_custom",
    );
  });
});
