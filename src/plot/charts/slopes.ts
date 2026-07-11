/**
 * Simple-slopes interaction plot, as seminr's `slope_analysis`
 * (plot_results.R:185) and `plot_interaction` (plot_results.R:132): the
 * IV -> DV relationship at -1SD / mean / +1SD of the moderator.
 */

import { nmGet, type NamedMatrix } from "../../math/matrix.ts";
import {
  frame,
  SvgPlot,
  svgAxes,
  svgClose,
  svgGrid,
  svgLine,
  svgOpen,
  svgPolyline,
  svgText,
  xPos,
  yPos,
} from "./svg.ts";

/** The engine only needs named path coefficients. */
export interface PathModel {
  readonly pathCoef: NamedMatrix;
}

/** R legend keywords supported by `legPlace`. */
export type LegendPlace =
  | "bottomright"
  | "bottomleft"
  | "topright"
  | "topleft"
  | "bottom"
  | "top"
  | "left"
  | "right"
  | "center";

export interface SlopeSeries {
  /** y values at x = -1, 0, 1 for the moderator at -1SD. */
  lowModerator: [number, number, number];
  /** y values at x = -1, 0, 1 for the moderator at its mean. */
  meanModerator: [number, number, number];
  /** y values at x = -1, 0, 1 for the moderator at +1SD. */
  highModerator: [number, number, number];
}

// R's design matrix (plot_results.R:196): rows are (iv, iv*moderator,
// moderator) weights over the 3x3 grid of iv x moderator levels.
const DESIGN: readonly (readonly [number, number, number])[] = [
  [-1, 1, -1],
  [-1, 0, 0],
  [-1, -1, 1],
  [0, 0, -1],
  [0, 0, 0],
  [0, 0, 1],
  [1, -1, -1],
  [1, 0, 0],
  [1, 1, 1],
];

/** The three plotted slope lines' y values (pure data, reused by tests). */
export function slopeSeries(
  moderatedModel: PathModel,
  dv: string,
  moderator: string,
  iv: string,
): SlopeSeries {
  const coefs = [
    nmGet(moderatedModel.pathCoef, iv, dv),
    nmGet(moderatedModel.pathCoef, `${iv}*${moderator}`, dv),
    nmGet(moderatedModel.pathCoef, moderator, dv),
  ] as const;
  const res = DESIGN.map(
    (row) => row[0] * coefs[0] + row[1] * coefs[1] + row[2] * coefs[2],
  );
  return {
    lowModerator: [res[0]!, res[3]!, res[6]!],
    meanModerator: [res[1]!, res[4]!, res[7]!],
    highModerator: [res[2]!, res[5]!, res[8]!],
  };
}

const LEGEND_ANCHOR: Record<LegendPlace, readonly [number, number]> = {
  bottomright: [1, 0],
  bottomleft: [0, 0],
  topright: [1, 1],
  topleft: [0, 1],
  bottom: [0.5, 0],
  top: [0.5, 1],
  left: [0, 0.5],
  right: [1, 0.5],
  center: [0.5, 0.5],
};

/** Simple-slopes plot of a moderated relationship. */
export function slopeAnalysis(
  moderatedModel: PathModel,
  dv: string,
  moderator: string,
  iv: string,
  legPlace: LegendPlace = "bottomright",
): SvgPlot {
  const series = slopeSeries(moderatedModel, dv, moderator, iv);
  const all = [...series.lowModerator, ...series.meanModerator, ...series.highModerator];
  const f = frame([-1, 1], [Math.min(...all), Math.max(...all)]);
  const xs = [-1, 0, 1];

  const lines: Array<{ label: string; values: readonly number[]; dash?: string }> = [
    { label: `${moderator} at -1SD`, values: series.lowModerator, dash: "8,5" },
    { label: `${moderator} at Mean`, values: series.meanModerator },
    { label: `${moderator} at +1SD`, values: series.highModerator, dash: "2,4" },
  ];

  let out = svgOpen(f.width, f.height);
  out += svgGrid(f);
  out += svgAxes(f, { xLabel: iv, yLabel: dv });
  for (const line of lines) {
    out += svgPolyline(
      xs.map((x, i) => [xPos(f, x), yPos(f, line.values[i]!)] as const),
      line.dash !== undefined
        ? { "stroke-dasharray": line.dash, "data-series": line.label }
        : { "data-series": line.label },
    );
  }

  // frameless legend
  const [ax, ay] = LEGEND_ANCHOR[legPlace];
  const left = f.margin.left;
  const right = f.width - f.margin.right;
  const top = f.margin.top;
  const bottom = f.height - f.margin.bottom;
  const legendWidth = 150;
  const legendHeight = lines.length * 16 + 8;
  const lx = left + 10 + ax * (right - left - legendWidth - 20);
  const ly = bottom - 10 - legendHeight - ay * (bottom - top - legendHeight - 20) + legendHeight;
  lines.forEach((line, index) => {
    const rowY = ly - legendHeight + 12 + index * 16;
    out += svgLine(lx, rowY - 4, lx + 24, rowY - 4, {
      ...(line.dash !== undefined ? { "stroke-dasharray": line.dash } : {}),
    });
    out += svgText(lx + 30, rowY, line.label, { "font-size": 10 });
  });

  out += svgClose();
  return new SvgPlot(out);
}

/** Interaction plot for a moderated model; `intxn` is "iv*moderator". */
export function plotInteraction(
  moderatedModel: PathModel,
  intxn: string,
  dv: string,
  legend: LegendPlace = "bottomright",
): SvgPlot {
  const starIndex = intxn.indexOf("*");
  if (starIndex === -1) throw new Error(`Not an interaction name: ${intxn}`);
  const iv = intxn.slice(0, starIndex);
  const moderator = intxn.slice(starIndex + 1);
  return slopeAnalysis(moderatedModel, dv, moderator, iv, legend);
}
