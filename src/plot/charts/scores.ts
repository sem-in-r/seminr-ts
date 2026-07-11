/**
 * Scatterplot matrix of construct scores, as seminr's `plot_scores`
 * (plot_results.R:2): construct names on the diagonal, pairwise score
 * scatters (translucent grey points) off it, and R `pairs()`-style
 * alternating tick axes on the outer edges of the matrix.
 */

import type { NamedMatrix } from "../../math/matrix.ts";
import {
  FONT_FAMILY,
  SvgPlot,
  extendRange,
  prettyTicks,
  px,
  svgCircle,
  svgLine,
  svgRect,
  svgText,
  tickLabel,
} from "./svg.ts";

/** The engine only needs named construct scores. */
export interface ScoredModel {
  readonly constructs: readonly string[];
  readonly constructScores: NamedMatrix;
}

const PANEL_SIZE = 192; // 2in per panel at 96 dpi, as the py port's figsize
const OUTER_MARGIN = 40; // room for the pairs()-style edge ticks and labels
const TICK_LENGTH = 4;
const POINT_COLOR = "rgb(128,128,128)"; // R rgb(0.5, 0.5, 0.5, alpha = 0.6)
const POINT_OPACITY = 0.6;

function column(scores: NamedMatrix, name: string): number[] {
  const j = scores.cols.indexOf(name);
  if (j === -1) throw new Error(`Unknown construct: ${name}`);
  return scores.values.map((row) => row[j]!);
}

/** Scatterplot matrix of construct scores. */
export function plotScores(
  model: ScoredModel,
  constructs?: readonly string[],
): SvgPlot {
  const names = constructs ?? model.constructs;
  const k = names.length;
  const columns = new Map(names.map((name) => [name, column(model.constructScores, name)]));
  // each variable's panel range is its data range with R's 4% xaxs = "r" pad
  const ranges = new Map(
    names.map((name) => {
      const values = columns.get(name)!;
      return [name, extendRange([Math.min(...values), Math.max(...values)])] as const;
    }),
  );
  const ticks = new Map(
    names.map((name) => {
      const [lo, hi] = ranges.get(name)!;
      return [name, prettyTicks(lo, hi)] as const;
    }),
  );

  const size = k * PANEL_SIZE + 2 * OUTER_MARGIN;
  const nearEdge = OUTER_MARGIN; // top / left of the matrix
  const farEdge = OUTER_MARGIN + k * PANEL_SIZE; // bottom / right
  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" font-family="${FONT_FAMILY}" font-size="12">\n` +
    `<rect width="${size}" height="${size}" fill="white"/>\n`;

  const xAt = (name: string, x0: number, value: number): number => {
    const [lo, hi] = ranges.get(name)!;
    return x0 + ((value - lo) / (hi - lo)) * PANEL_SIZE;
  };
  const yAt = (name: string, y0: number, value: number): number => {
    const [lo, hi] = ranges.get(name)!;
    return y0 + PANEL_SIZE - ((value - lo) / (hi - lo)) * PANEL_SIZE;
  };

  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const x0 = OUTER_MARGIN + j * PANEL_SIZE;
      const y0 = OUTER_MARGIN + i * PANEL_SIZE;
      out += `<g data-panel="${i},${j}">\n`;
      out += svgRect(x0, y0, PANEL_SIZE, PANEL_SIZE, { fill: "none", stroke: "black" });
      if (i === j) {
        out += svgText(x0 + PANEL_SIZE / 2, y0 + PANEL_SIZE / 2 + 4, names[i]!, {
          "text-anchor": "middle",
        });
      } else {
        const xs = columns.get(names[j]!)!;
        const ys = columns.get(names[i]!)!;
        for (let p = 0; p < xs.length; p++) {
          const cx = xAt(names[j]!, x0, xs[p]!);
          const cy = yAt(names[i]!, y0, ys[p]!);
          out += svgCircle(cx, cy, 2, { fill: POINT_COLOR, "fill-opacity": POINT_OPACITY });
        }
      }
      out += "</g>\n";
    }
  }

  // R pairs() axis alternation: x-axes on the bottom edge for odd 1-based
  // columns and the top edge for even; y-axes on the right edge for odd
  // 1-based rows and the left edge for even.
  for (let j = 0; j < k; j++) {
    const x0 = OUTER_MARGIN + j * PANEL_SIZE;
    const onTop = (j + 1) % 2 === 0;
    const edge = onTop ? nearEdge : farEdge;
    const direction = onTop ? -1 : 1;
    out += `<g data-axis="${onTop ? "top" : "bottom"}">\n`;
    for (const tick of ticks.get(names[j]!)!) {
      const x = xAt(names[j]!, x0, tick);
      out += svgLine(x, edge, x, edge + direction * TICK_LENGTH);
      out += svgText(x, edge + direction * (TICK_LENGTH + 4) + (onTop ? 0 : 8), tickLabel(tick), {
        "text-anchor": "middle",
      });
    }
    out += "</g>\n";
  }
  for (let i = 0; i < k; i++) {
    const y0 = OUTER_MARGIN + i * PANEL_SIZE;
    const onLeft = (i + 1) % 2 === 0;
    const edge = onLeft ? nearEdge : farEdge;
    const direction = onLeft ? -1 : 1;
    out += `<g data-axis="${onLeft ? "left" : "right"}">\n`;
    for (const tick of ticks.get(names[i]!)!) {
      const y = yAt(names[i]!, y0, tick);
      out += svgLine(edge, y, edge + direction * TICK_LENGTH, y);
      out += svgText(edge + direction * (TICK_LENGTH + 4), y + 4, tickLabel(tick), {
        "text-anchor": onLeft ? "end" : "start",
      });
    }
    out += "</g>\n";
  }

  out += "</svg>\n";
  return new SvgPlot(out);
}

/** Reused by tests: the pixel-free panel data (columns as plotted). */
export function scoresColumns(
  model: ScoredModel,
  constructs?: readonly string[],
): Map<string, number[]> {
  const names = constructs ?? model.constructs;
  return new Map(names.map((name) => [name, column(model.constructScores, name)]));
}
