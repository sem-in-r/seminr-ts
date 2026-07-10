/**
 * PLSpredict error-density plot, as seminr's `plot.summary.predict_pls_model`
 * (report_summary.R:208): a gaussian kernel density of an indicator's
 * out-of-sample predictive error, with R's `bw.nrd0` default bandwidth.
 */

import type { NamedMatrix } from "../../math/matrix.ts";
import { sd } from "../../math/stats.ts";
import {
  extendRange,
  frame,
  SvgPlot,
  svgAxes,
  svgClose,
  svgGrid,
  svgOpen,
  svgPolyline,
  xPos,
  yPos,
} from "./svg.ts";

/** The engine only needs the per-indicator residual matrix. */
export interface PredictErrorSource {
  readonly predictionError: NamedMatrix;
}

/** R's `bw.nrd0` default density bandwidth. */
export function nrd0Bandwidth(values: readonly number[]): number {
  const n = values.length;
  const stdev = sd(values);
  const sorted = [...values].sort((a, b) => a - b);
  // R quantile type 7
  const quantile = (p: number): number => {
    const h = (n - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
  };
  const iqr = quantile(0.75) - quantile(0.25);
  let spread = Math.min(stdev, iqr / 1.34);
  if (spread === 0) spread = stdev || Math.abs(values[0]!) || 1;
  return 0.9 * spread * n ** (-1 / 5);
}

export interface DensityEstimate {
  x: number[];
  y: number[];
  bandwidth: number;
  n: number;
}

/**
 * Gaussian kernel density over R's default grid: 512 points spanning the data
 * range extended by `cut = 3` bandwidths (direct summation; R's FFT binning
 * agrees to plotting accuracy).
 */
export function densityEstimate(values: readonly number[], gridSize = 512): DensityEstimate {
  const bandwidth = nrd0Bandwidth(values);
  const min = Math.min(...values) - 3 * bandwidth;
  const max = Math.max(...values) + 3 * bandwidth;
  const n = values.length;
  const x: number[] = [];
  const y: number[] = [];
  const norm = 1 / (n * bandwidth * Math.sqrt(2 * Math.PI));
  const step = (max - min) / (gridSize - 1);
  for (let i = 0; i < gridSize; i++) {
    const xi = min + i * step;
    let density = 0;
    for (const value of values) {
      const z = (xi - value) / bandwidth;
      density += Math.exp(-0.5 * z * z);
    }
    x.push(xi);
    y.push(density * norm);
  }
  return { x, y, bandwidth, n };
}

/** Format the bandwidth as R's default `%.4g` in the x-axis annotation. */
function signif4(value: number): string {
  return String(Number(value.toPrecision(4)));
}

/** Density plot of an indicator's out-of-sample predictive error. */
export function plotPredictError(
  predictionSummary: PredictErrorSource,
  indicator: string,
): SvgPlot {
  const table = predictionSummary.predictionError;
  const j = table.cols.indexOf(indicator);
  if (j === -1) throw new Error(`Unknown indicator: ${indicator}`);
  const errors = table.values.map((row) => row[j]!);

  const { x, y, bandwidth, n } = densityEstimate(errors);
  // R plot() default xaxs/yaxs = "r": the frame sits 4% beyond the data
  const f = frame(
    extendRange([x[0]!, x[x.length - 1]!]),
    extendRange([0, Math.max(...y)]),
  );

  let out = svgOpen(f.width, f.height);
  out += svgGrid(f);
  out += svgAxes(f, {
    title: `Distribution of predictive error of ${indicator}`,
    xLabel: `N = ${n}   Bandwidth = ${signif4(bandwidth)}`,
    yLabel: "Density",
  });
  out += svgPolyline(
    x.map((xi, i) => [xPos(f, xi), yPos(f, y[i]!)] as const),
    { "data-series": "density" },
  );
  out += svgClose();
  return new SvgPlot(out);
}
