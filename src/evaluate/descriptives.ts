/**
 * Item and construct descriptive statistics (report_descriptives.R:2-14) with
 * seminr's `desc()` stat set (library.R:247-282): raw-data item statistics,
 * construct-score statistics, and both correlation matrices.
 */

import { colCor, mean, sd } from "../math/stats.ts";
import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import { measurementModelItems } from "../model/mmMatrix.ts";
import { getColumn, selectColumns, type Dataset } from "../estimate/data.ts";
import type { PlsModel } from "../estimate/estimatePls.ts";

const DESC_STATS = [
  "No.",
  "Missing",
  "Mean",
  "Median",
  "Min",
  "Max",
  "Std.Dev.",
  "Kurtosis",
  "Skewness",
] as const;

function median(sorted: readonly number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Moment-based kurtosis (not excess) and skewness, as seminr's `kurt`/`skew`. */
function moments(x: readonly number[], m: number): { kurtosis: number; skewness: number } {
  const n = x.length;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  for (const v of x) {
    const d = v - m;
    s2 += d * d;
    s3 += d * d * d;
    s4 += d * d * d * d;
  }
  return {
    kurtosis: (n * s4) / (s2 * s2),
    skewness: s3 / n / Math.pow(s2 / n, 1.5),
  };
}

/** Per-column descriptive statistics table (rows = variables), NaN-tolerant. */
export function desc(data: Dataset): NamedMatrix {
  const values = data.columns.map((name, j) => {
    const raw = data.values.map((row) => row[j]!);
    const present = raw.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    const m = mean(present);
    const sorted = [...present].sort((a, b) => a - b);
    const { kurtosis, skewness } = moments(present, m);
    return [
      j + 1,
      raw.length - present.length,
      m,
      median(sorted),
      sorted[0]!,
      sorted[sorted.length - 1]!,
      sd(present),
      kurtosis,
      skewness,
    ];
  });
  return namedMatrix(data.columns, [...DESC_STATS], values);
}

export interface PlsDescriptives {
  statistics: { items: NamedMatrix; constructs: NamedMatrix };
  correlations: { items: NamedMatrix; constructs: NamedMatrix };
}

/** Item and construct statistics and correlations, as seminr's `descriptives()`. */
export function descriptives(model: PlsModel): PlsDescriptives {
  const locItems = measurementModelItems(model.measurementModel);
  const itemData = selectColumns(model.rawdata, locItems);
  const scores = model.constructScores;
  return {
    statistics: {
      items: desc(itemData),
      constructs: desc({ columns: scores.cols, values: scores.values }),
    },
    correlations: {
      items: namedMatrix(
        model.data.columns,
        model.data.columns,
        colCor(model.data.values, model.data.values),
      ),
      constructs: namedMatrix(scores.cols, scores.cols, colCor(scores.values, scores.values)),
    },
  };
}
