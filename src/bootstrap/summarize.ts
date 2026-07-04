/**
 * Bootstrapped-model summary tables, as seminr's `summary.boot_seminr_model`
 * (report_summary.R:55-85) and `parse_boot_array*`
 * (report_paths_and_intervals.R:271-357): one row per nonzero original cell
 * with original estimate, boot mean/SD, t, percentile CI bounds, and the
 * bootstrap p-value.
 */

import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import { mean, sd, quantile } from "../math/stats.ts";
import { htmt } from "../evaluate/validity.ts";
import { totalIndirectEffects } from "../evaluate/effects.ts";
import type { PlsModel } from "../estimate/estimatePls.ts";
import { totalEffects, type BootModel } from "./bootstrap.ts";

/** seminr renders t-statistics past this magnitude as NA (division by ~zero SD). */
const T_STAT_CUTOFF = 999999999;

interface ParseBootOptions {
  /** t numerator: original (default) or 1 - original for HTMT. */
  tNumerator?: (original: number) => number;
  /** p-value reference point: 0 (default) or 1 for HTMT. */
  pReference?: number;
}

function parseBoot(
  original: NamedMatrix,
  replications: readonly NamedMatrix[],
  alpha: number,
  options: ParseBootOptions = {},
): NamedMatrix {
  const tNumerator = options.tNumerator ?? ((o: number): number => o);
  const pReference = options.pReference ?? 0;
  const lowerPct = (100 * alpha) / 2;
  const labels: string[] = [];
  const values: number[][] = [];
  for (let i = 0; i < original.rows.length; i++) {
    for (let j = 0; j < original.cols.length; j++) {
      const cell = original.values[i]![j]!;
      const estimate = Number.isNaN(cell) ? 0 : cell;
      if (estimate === 0) continue;
      const reps = replications.map((rep) => rep.values[i]![j]!);
      const bootSd = sd(reps);
      const tStat = tNumerator(estimate) / bootSd;
      // p = 2*min(mean(below), mean(not below)); "below" is <= 0 for effects, < 1 for HTMT
      let below = 0;
      for (const v of reps) if (pReference === 0 ? v <= 0 : v < pReference) below++;
      const pLow = below / reps.length;
      const pValue = 2 * Math.min(pLow, 1 - pLow);
      labels.push(`${original.rows[i]}  ->  ${original.cols[j]}`);
      values.push([
        estimate,
        mean(reps),
        bootSd,
        tStat > T_STAT_CUTOFF ? Number.NaN : tStat,
        quantile(reps, alpha / 2),
        quantile(reps, 1 - alpha / 2),
        pValue,
      ]);
    }
  }
  return namedMatrix(
    labels,
    [
      "Original Est.",
      "Bootstrap Mean",
      "Bootstrap SD",
      "T Stat.",
      `${lowerPct}% CI`,
      `${100 - lowerPct}% CI`,
      "Bootstrap P Val",
    ],
    values,
  );
}

/** Boot summary table over the nonzero cells of an original matrix. */
export function parseBootArray(
  original: NamedMatrix,
  replications: readonly NamedMatrix[],
  alpha = 0.05,
): NamedMatrix {
  return parseBoot(original, replications, alpha);
}

/** HTMT variant: t tests distance from 1, p-value counts replicates below/above 1. */
export function parseBootArrayHtmt(
  original: NamedMatrix,
  replications: readonly NamedMatrix[],
  alpha = 0.05,
): NamedMatrix {
  return parseBoot(original, replications, alpha, {
    tNumerator: (o) => 1 - o,
    pReference: 1,
  });
}

export interface PlsBootSummary {
  nboot: number;
  bootstrappedPaths: NamedMatrix;
  bootstrappedWeights: NamedMatrix;
  bootstrappedLoadings: NamedMatrix;
  bootstrappedHtmt: NamedMatrix;
  bootstrappedTotalPaths: NamedMatrix;
  /** Null when the model has no indirect effects (seminr's "No indirect effects"). */
  bootstrappedTotalIndirectPaths: NamedMatrix | null;
}

/** Summarize a bootstrapped PLS model, as seminr's `summary()` on a boot model. */
export function summarizePlsBoot(boot: BootModel, alpha = 0.05): PlsBootSummary {
  const model: PlsModel = { ...boot, kind: "pls" };
  const totalIndirect = totalIndirectEffects(boot.pathCoef);
  const hasIndirect = totalIndirect.values.some((row) => row.some((v) => v !== 0));
  const indirectReplications = boot.bootTotalPaths.map((tp, k) =>
    namedMatrix(
      tp.rows,
      tp.cols,
      tp.values.map((row, i) => row.map((v, j) => v - boot.bootPaths[k]!.values[i]![j]!)),
    ),
  );
  return {
    nboot: boot.boots,
    bootstrappedPaths: parseBootArray(boot.pathCoef, boot.bootPaths, alpha),
    bootstrappedWeights: parseBootArray(boot.outerWeights, boot.bootWeights, alpha),
    bootstrappedLoadings: parseBootArray(boot.outerLoadings, boot.bootLoadings, alpha),
    bootstrappedHtmt: parseBootArrayHtmt(htmt(model), boot.bootHtmt, alpha),
    bootstrappedTotalPaths: parseBootArray(totalEffects(boot.pathCoef), boot.bootTotalPaths, alpha),
    // deliberate deviation: seminr's parse_boot_array_total_indirect hardcodes
    // alpha = 0.05 (its alpha parameter is unused); we honor the caller's alpha
    bootstrappedTotalIndirectPaths: hasIndirect
      ? parseBootArray(totalIndirect, indirectReplications, alpha)
      : null,
  };
}
