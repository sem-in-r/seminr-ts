/**
 * DOT parity tests for bootstrapped-model plots (plot plan 2.2a): boot edge
 * labels reproduce R's values exactly because the bootstrap re-runs on R's
 * exported resample indices (boot_indices.json, M6 config).
 */

import { describe, test } from "bun:test";
import { dotGraph } from "../../src/plot/dotGraph.ts";
import { edgeTemplateDefault, seminrThemeCreate } from "../../src/plot/theme.ts";
import { expectDotEqual, m6Boot } from "./helpers.ts";

describe("bootstrapped model plots", () => {
  test("default theme, alpha=0.05", async () => {
    await expectDotEqual(dotGraph(await m6Boot()), "boot_default");
  });

  test("alpha=0.01", async () => {
    await expectDotEqual(dotGraph(await m6Boot(), { alpha: 0.01 }), "boot_alpha01");
  });

  test("all boot label elements enabled", async () => {
    const theme = seminrThemeCreate({
      smEdgeBootShowTValue: true,
      smEdgeBootShowPValue: true,
      smEdgeBootShowPStars: true,
      smEdgeBootShowCi: true,
      mmEdgeBootShowTValue: true,
      mmEdgeBootShowPValue: true,
      mmEdgeBootShowPStars: true,
      mmEdgeBootShowCi: true,
      mmEdgeBootTemplate: edgeTemplateDefault(),
    });
    await expectDotEqual(dotGraph(await m6Boot(), { theme }), "boot_full_labels");
  });
});
