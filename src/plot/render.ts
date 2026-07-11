/**
 * Renderer shim: turn DOT source into an SVG string via `@hpcc-js/wasm-graphviz`
 * (real Graphviz compiled to wasm — the same C engine behind R seminr's viz.js
 * rendering path), loaded with a call-time dynamic import (plan D2).
 *
 * The package is an optional peer dependency: when it is absent, rendering
 * rejects with an install hint while the `.dot` source stays fully usable.
 */

const INSTALL_HINT =
  "No Graphviz renderer found. Install the optional peer dependency with " +
  '"bun add @hpcc-js/wasm-graphviz" (or npm/pnpm equivalent) to render SVG. ' +
  "The DOT source is available without a renderer via the plot's .dot property.";

interface GraphvizInstance {
  layout(dot: string, format: "svg", engine: "dot"): string;
}

let graphvizInstance: GraphvizInstance | undefined;

async function loadGraphviz(): Promise<GraphvizInstance> {
  if (graphvizInstance) return graphvizInstance;
  let mod: { Graphviz: { load(): Promise<GraphvizInstance> } };
  try {
    mod = (await import("@hpcc-js/wasm-graphviz")) as typeof mod;
  } catch (cause) {
    throw new Error(INSTALL_HINT, { cause });
  }
  graphvizInstance = await mod.Graphviz.load();
  return graphvizInstance;
}

/** Whether the wasm Graphviz renderer can be loaded. */
export async function rendererAvailable(): Promise<boolean> {
  try {
    await loadGraphviz();
    return true;
  } catch {
    return false;
  }
}

export interface RenderOptions {
  /** Target width in pixels (96 dpi, as R's `save_plot`). */
  width?: number;
  /** Target height in pixels (96 dpi, as R's `save_plot`). */
  height?: number;
}

/**
 * Inject a Graphviz `size` attribute (inches, forced with `!`) right after the
 * opening brace — the wasm build has no CLI, so `-Gsize=...` becomes a source
 * rewrite.
 */
export function applySizeAttribute(dot: string, width?: number, height?: number): string {
  if (width === undefined && height === undefined) return dot;
  const wIn = (width ?? height ?? 0) / 96;
  const hIn = (height ?? width ?? 0) / 96;
  return dot.replace(/\{/, `{\ngraph [size = "${wIn},${hIn}!"]`);
}

/** Render DOT source to an SVG string. */
export async function renderSvg(dot: string, options: RenderOptions = {}): Promise<string> {
  const graphviz = await loadGraphviz();
  return graphviz.layout(applySizeAttribute(dot, options.width, options.height), "svg", "dot");
}
