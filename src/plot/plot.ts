/**
 * `plot()`, the SeminrPlot value object, `savePlot()`, and the last-plot cache.
 *
 * R's `plot.seminr_model` hands the DOT string to DiagrammeR/viz.js; this port
 * wraps it in {@link SeminrPlot}, which renders to SVG on demand (wasm
 * Graphviz, async) and always exposes the raw `.dot` source. `savePlot()`/
 * `lastSeminrPlot()` mirror seminr's last-plot workflow (plot_lastplot.R).
 *
 * `save()` writes via a call-time dynamic import of `node:fs/promises` (plan
 * D4): it works in Bun/Node and throws a clear error in browsers, where
 * `toSvg()` is the way to obtain rendered output.
 */

import { dotGraph, type DotGraphOptions, type PlottableModel } from "./dotGraph.ts";
import { dotGraphHtmt, type DotGraphHtmtOptions } from "./htmt.ts";
import { renderSvg } from "./render.ts";
import type { BootModel } from "../bootstrap/bootstrap.ts";

export interface SaveOptions {
  /** Target width in pixels (96 dpi, as R's `save_plot`). */
  width?: number;
  /** Target height in pixels (96 dpi, as R's `save_plot`). */
  height?: number;
}

async function writeTextFile(filename: string, content: string): Promise<void> {
  let fs: typeof import("node:fs/promises");
  try {
    fs = await import("node:fs/promises");
  } catch (cause) {
    throw new Error(
      "Saving plots to file is not available in browsers; use toSvg() and " +
        "handle the SVG string yourself.",
      { cause },
    );
  }
  await fs.writeFile(filename, content, "utf8");
}

/** A rendered-on-demand seminr plot: a DOT string plus rendering helpers. */
export class SeminrPlot {
  constructor(readonly dot: string) {}

  toString(): string {
    return this.dot;
  }

  /** Render to an SVG string (async: loads wasm Graphviz on first use). */
  toSvg(options: SaveOptions = {}): Promise<string> {
    return renderSvg(this.dot, options);
  }

  /** Save to file; the format follows the extension (svg/dot/gv). */
  async save(filename: string, options: SaveOptions = {}): Promise<void> {
    const extension = (filename.split(".").pop() ?? "").toLowerCase();
    if (extension === "dot" || extension === "gv") {
      await writeTextFile(filename, `${this.dot}\n`);
      return;
    }
    if (extension !== "svg") {
      throw new Error(
        `Unsupported file type: '${extension}'. Please use svg, dot, or gv.`,
      );
    }
    await writeTextFile(filename, await this.toSvg(options));
  }
}

// Last-plot cache (plot_lastplot.R)
let lastPlot: SeminrPlot | undefined;

/** Store the most recent plot for `savePlot()` (plot_lastplot.R:18). */
export function setLastSeminrPlot(value: SeminrPlot | undefined): void {
  lastPlot = value;
}

/** Retrieve the most recent plot (plot_lastplot.R:26). */
export function lastSeminrPlot(): SeminrPlot | undefined {
  return lastPlot;
}

/** Plot a seminr model, as R's `plot.seminr_model` (plot_dot.R:30). */
export function plot(model: PlottableModel, options: DotGraphOptions = {}): SeminrPlot {
  const res = new SeminrPlot(dotGraph(model, options));
  setLastSeminrPlot(res);
  return res;
}

/** Plot the HTMT construct network of a bootstrapped model (plot_htmt.R:64). */
export function plotHtmt(model: BootModel, options: DotGraphHtmtOptions = {}): SeminrPlot {
  const res = new SeminrPlot(dotGraphHtmt(model, options));
  setLastSeminrPlot(res);
  return res;
}

export interface SavePlotOptions extends SaveOptions {
  /** The plot to save; defaults to the last plot created. */
  plot?: SeminrPlot;
}

/** Save a seminr plot to file; defaults to the last plot created (plot_dot.R:141). */
export async function savePlot(filename: string, options: SavePlotOptions = {}): Promise<void> {
  const target = options.plot ?? lastSeminrPlot();
  if (target === undefined) throw new Error("No compatible plot was created.");
  await target.save(filename, { width: options.width, height: options.height });
}
