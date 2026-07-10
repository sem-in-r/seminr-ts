/**
 * DOT parity tests for specification-only plots (plot plan 2.1a): measurement
 * model, structural model, and bundled specified model rendered via the
 * artificial unit-valued model path (plot_dot.R:326/415/486).
 */

import { describe, test } from "bun:test";
import { dotGraph } from "../../src/plot/dotGraph.ts";
import { specifyModel } from "../../src/specify/specifyModel.ts";
import { ECSI_SM, expectDotEqual, mixedMm } from "./helpers.ts";

describe("specification-only plots", () => {
  test("measurement model", async () => {
    await expectDotEqual(dotGraph(mixedMm()), "spec_measurement");
  });

  test("structural model", async () => {
    await expectDotEqual(dotGraph(ECSI_SM), "spec_structural");
  });

  test("specified model", async () => {
    await expectDotEqual(dotGraph(specifyModel(mixedMm(), ECSI_SM)), "spec_specified");
  });
});
