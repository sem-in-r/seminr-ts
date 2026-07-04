/**
 * Bootstrap mediation helpers, as seminr's `specific_effect_significance`
 * (report_paths_and_intervals.R:165-215) and `total_indirect_ci`
 * (report_paths_and_intervals.R:263-270): per-replication products of path
 * draws along a mediation chain, with percentile CIs and bootstrap p-values.
 */

import { nmGet } from "../math/matrix.ts";
import { mean, sd, quantile } from "../math/stats.ts";
import type { BootModel } from "./bootstrap.ts";

export interface SpecificEffectSignificance {
  /** "from -> through... -> to" label. */
  path: string;
  originalEst: number;
  bootstrapMean: number;
  bootstrapSd: number;
  tStat: number;
  ciLower: number;
  ciUpper: number;
  bootstrapP: number;
}

export interface SpecificEffectOptions {
  from: string;
  to: string;
  /** Serial mediators between `from` and `to`, in order (max 4). */
  through?: readonly string[];
  alpha?: number;
}

export function specificEffectSignificance(
  boot: BootModel,
  options: SpecificEffectOptions,
): SpecificEffectSignificance {
  const { from, to, through = [], alpha = 0.05 } = options;
  if (through.length > 4) {
    throw new Error("Currently only serial mediation with 4 mediating variables is allowed");
  }
  const chain = [from, ...through, to];

  // Per-replication product of the path draws along the chain; the original
  // estimate is the same product over the fitted path coefficients.
  let originalEst = 1;
  for (let s = 0; s < chain.length - 1; s++) {
    originalEst *= nmGet(boot.pathCoef, chain[s]!, chain[s + 1]!);
  }
  const coefficients = boot.bootPaths.map((rep) => {
    let product = 1;
    for (let s = 0; s < chain.length - 1; s++) {
      product *= nmGet(rep, chain[s]!, chain[s + 1]!);
    }
    return product;
  });

  const bootstrapSd = sd(coefficients);
  // p = 2*min(mean(b <= 0), mean(b > 0)), as seminr
  let below = 0;
  for (const v of coefficients) if (v <= 0) below++;
  const pLow = below / coefficients.length;

  return {
    path: chain.join(" -> "),
    originalEst,
    bootstrapMean: mean(coefficients),
    bootstrapSd,
    tStat: originalEst / bootstrapSd,
    ciLower: quantile(coefficients, alpha / 2),
    ciUpper: quantile(coefficients, 1 - alpha / 2),
    bootstrapP: 2 * Math.min(pLow, 1 - pLow),
  };
}

export interface TotalIndirectCiOptions {
  from: string;
  to: string;
  alpha?: number;
}

export interface TotalIndirectCi {
  lower: number;
  upper: number;
}

/** Percentile CI of the total indirect effect: (total - direct) per replication. */
export function totalIndirectCi(boot: BootModel, options: TotalIndirectCiOptions): TotalIndirectCi {
  const { from, to, alpha = 0.05 } = options;
  const coefficients = boot.bootTotalPaths.map(
    (total, k) => nmGet(total, from, to) - nmGet(boot.bootPaths[k]!, from, to),
  );
  return {
    lower: quantile(coefficients, alpha / 2),
    upper: quantile(coefficients, 1 - alpha / 2),
  };
}
