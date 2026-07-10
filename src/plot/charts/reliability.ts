/**
 * Reliability chart (alpha/rhoA/rhoC per construct), as seminr's
 * `plot.reliability_table` (plot_results.R:44): rhoA as the anchor bar with
 * alpha and rhoC hanging off it, plus the 0.708 threshold line.
 */

import type { NamedMatrix } from "../../math/matrix.ts";
import {
  frame,
  prettyTicks,
  SvgPlot,
  svgAxes,
  svgCircle,
  svgClose,
  svgGrid,
  svgLine,
  svgOpen,
  svgPolygon,
  svgRect,
  svgText,
  xPos,
  yPos,
  type Frame,
} from "./svg.ts";

const THRESHOLD = 0.708;

function columnOf(table: NamedMatrix, name: string): number[] {
  const j = table.cols.indexOf(name);
  if (j === -1) throw new Error(`Reliability table has no '${name}' column`);
  return table.values.map((row) => row[j]!);
}

function square(f: Frame, x: number, y: number): string {
  const cx = xPos(f, x);
  const cy = yPos(f, y);
  return svgRect(cx - 4, cy - 4, 8, 8, { fill: "black", "data-marker": "rhoA" });
}

function triangle(f: Frame, x: number, y: number): string {
  const cx = xPos(f, x);
  const cy = yPos(f, y);
  return svgPolygon(
    [
      [cx, cy - 5],
      [cx - 5, cy + 4],
      [cx + 5, cy + 4],
    ],
    { fill: "black", "data-marker": "rhoC" },
  );
}

/** Reliability chart over a `reliabilityTable()` result. */
export function plotReliabilityTable(table: NamedMatrix): SvgPlot {
  const n = table.rows.length;
  const alpha = columnOf(table, "alpha");
  const rhoA = columnOf(table, "rhoA");
  const rhoC = columnOf(table, "rhoC");
  const x = Array.from({ length: n }, (_, i) => i + 1);

  const finite = table.values.flat().filter((v) => Number.isFinite(v));
  const minValue = Math.min(...finite);
  const maxValue = Math.max(...finite);
  // plot_results.R:55 — floor the y axis at 0.6 unless values dip lower
  const lowerLim = minValue - 0.2 >= 0.6 ? 0.6 : minValue - 0.2;
  const upperLim = maxValue;

  const f = frame([0.7, n + 0.2], [lowerLim, upperLim]);
  const yTicks = prettyTicks(lowerLim, upperLim);

  let out = svgOpen(f.width, f.height);
  out += svgGrid(f, x, yTicks);
  out += svgAxes(f, {
    xTicks: x,
    xTickLabels: [...table.rows],
    xTickAngle: 35,
    yTicks,
    box: false,
  });

  for (let i = 0; i < n; i++) {
    const xi = x[i]!;
    // rhoA anchor bar and square
    out += svgLine(xPos(f, xi - 0.2), yPos(f, rhoA[i]!), xPos(f, xi + 0.2), yPos(f, rhoA[i]!));
    out += square(f, xi, rhoA[i]!);
    // alpha stem and circle
    out += svgLine(xPos(f, xi - 0.1), yPos(f, rhoA[i]!), xPos(f, xi - 0.1), yPos(f, alpha[i]!));
    out += svgCircle(xPos(f, xi - 0.1), yPos(f, alpha[i]!), 4, {
      fill: "black",
      "data-marker": "alpha",
    });
    // rhoC stem and triangle
    out += svgLine(xPos(f, xi + 0.1), yPos(f, rhoA[i]!), xPos(f, xi + 0.1), yPos(f, rhoC[i]!));
    out += triangle(f, xi + 0.1, rhoC[i]!);
  }

  // threshold (dashed blue), as abline(h = 0.708, lty = 2, col = "blue")
  out += svgLine(f.margin.left, yPos(f, THRESHOLD), f.width - f.margin.right, yPos(f, THRESHOLD), {
    stroke: "blue",
    "stroke-dasharray": "6,4",
    "data-threshold": THRESHOLD,
  });

  // frameless legend, bottom center: alpha (circle), rhoA (square), rhoC (triangle)
  const legendY = f.height - f.margin.bottom - 12;
  const centerX = (f.margin.left + f.width - f.margin.right) / 2;
  const entries: Array<[string, (cx: number, cy: number) => string]> = [
    ["alpha", (cx, cy) => svgCircle(cx, cy, 4, { fill: "black" })],
    ["rhoA", (cx, cy) => svgRect(cx - 4, cy - 4, 8, 8, { fill: "black" })],
    [
      "rhoC",
      (cx, cy) =>
        svgPolygon(
          [
            [cx, cy - 5],
            [cx - 5, cy + 4],
            [cx + 5, cy + 4],
          ],
          { fill: "black" },
        ),
    ],
  ];
  const slot = 90;
  entries.forEach(([label, marker], index) => {
    const cx = centerX + (index - 1) * slot;
    out += marker(cx - 24, legendY - 4);
    out += svgText(cx - 14, legendY, label);
  });

  out += svgClose();
  return new SvgPlot(out);
}
