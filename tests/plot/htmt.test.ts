/**
 * HTMT discriminant-validity plot parity tests (plot plan 4.1a): byte parity
 * with the R-generated fixtures on the M6 bootstrap, plus the R error on
 * non-bootstrapped models (plot_htmt.R:29).
 */

import { describe, expect, test } from "bun:test";
import { dotGraphHtmt } from "../../src/plot/htmt.ts";
import { basicReflectiveModel, expectDotEqual, m6Boot } from "./helpers.ts";

describe("dotGraphHtmt", () => {
  test("defaults (threshold=1, omit=TRUE, use_ci=FALSE)", async () => {
    await expectDotEqual(dotGraphHtmt(await m6Boot()), "htmt_default");
  });

  test("omitThresholdEdges=false renders all edges", async () => {
    await expectDotEqual(
      dotGraphHtmt(await m6Boot(), { omitThresholdEdges: false }),
      "htmt_all_edges",
    );
  });

  test("htmtThreshold=0.9 with useCi=true", async () => {
    await expectDotEqual(
      dotGraphHtmt(await m6Boot(), { htmtThreshold: 0.9, useCi: true }),
      "htmt_ci",
    );
  });

  test("throws on non-bootstrapped models", async () => {
    const model = await basicReflectiveModel();
    expect(() => dotGraphHtmt(model as never)).toThrow(
      "Plotting HTMT models only works with bootstrapped models",
    );
  });
});
