/**
 * SeminrPlot value object, last-plot cache, save dispatch, and wasm rendering
 * (plot plan 3.1a). The render smoke test uses the real `@hpcc-js/wasm-graphviz`
 * devDependency.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  lastSeminrPlot,
  plot,
  plotHtmt,
  savePlot,
  SeminrPlot,
  setLastSeminrPlot,
} from "../../src/plot/plot.ts";
import { applySizeAttribute, rendererAvailable, renderSvg } from "../../src/plot/render.ts";
import { basicReflectiveModel, loadPlotFixture, m6Boot } from "./helpers.ts";

afterEach(() => setLastSeminrPlot(undefined));

describe("SeminrPlot", () => {
  test("plot() wraps the dotGraph output and caches it as last plot", async () => {
    const p = plot(await basicReflectiveModel());
    expect(p).toBeInstanceOf(SeminrPlot);
    expect(p.dot).toBe(await loadPlotFixture("estimated_basic_reflective"));
    expect(String(p)).toBe(p.dot);
    expect(lastSeminrPlot()).toBe(p);
  });

  test("plotHtmt() also caches as last plot", async () => {
    const p = plotHtmt(await m6Boot());
    expect(p.dot).toBe(await loadPlotFixture("htmt_default"));
    expect(lastSeminrPlot()).toBe(p);
  });

  test("save() rejects unsupported extensions", async () => {
    const p = new SeminrPlot("digraph G { a -> b }");
    expect(p.save("plot.png")).rejects.toThrow(
      "Unsupported file type: 'png'. Please use svg, dot, or gv.",
    );
  });

  test("save() writes dot/gv source and svg renders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seminr-plot-"));
    try {
      const p = new SeminrPlot("digraph G { a -> b }");
      await p.save(join(dir, "graph.dot"));
      expect(await readFile(join(dir, "graph.dot"), "utf8")).toBe(`${p.dot}\n`);

      await p.save(join(dir, "graph.svg"));
      const svg = await readFile(join(dir, "graph.svg"), "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("savePlot() uses the last plot and errors when none exists", async () => {
    expect(savePlot("anything.svg")).rejects.toThrow("No compatible plot was created.");

    const dir = await mkdtemp(join(tmpdir(), "seminr-plot-"));
    try {
      const p = plot(await basicReflectiveModel());
      await savePlot(join(dir, "last.gv"));
      expect(await readFile(join(dir, "last.gv"), "utf8")).toBe(`${p.dot}\n`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("wasm renderer", () => {
  test("renderer is available (devDependency installed)", async () => {
    expect(await rendererAvailable()).toBe(true);
  });

  test("renders fixture DOT to SVG", async () => {
    const dot = await loadPlotFixture("estimated_basic_reflective");
    const svg = await renderSvg(dot);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Satisfaction");
    expect(svg).toContain("R² = 0.927");
  });

  test("toSvg() with width/height applies a size attribute", () => {
    const sized = applySizeAttribute("digraph G {\na -> b\n}", 192, 96);
    expect(sized).toContain('graph [size = "2,1!"]');
    expect(applySizeAttribute("digraph G {}", undefined, undefined)).toBe("digraph G {}");
  });
});
