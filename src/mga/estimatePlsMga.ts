/**
 * PLS-MGA: significance of path differences between two data subgroups
 * (estimate_pls_mga.R:45-120; Henseler, Ringle & Sinkovics 2009). Each group
 * is re-estimated and bootstrapped; the p-value per path compares the two
 * bootstrap distributions nonparametrically.
 */

import { estimatePls, type PlsModel } from "../estimate/estimatePls.ts";
import { bootstrapModel, type BootModel } from "../bootstrap/bootstrap.ts";
import { nmGet } from "../math/matrix.ts";
import { mean } from "../math/stats.ts";
import type { Dataset } from "../estimate/data.ts";

export interface PlsMgaOptions {
  nboot?: number;
  /** Seed for both groups' default resamplers. */
  seed?: number;
  /** Explicit 0-based resample indices per group (rows within the group data). */
  group1Indices?: number[][];
  group2Indices?: number[][];
}

export interface PlsMgaPath {
  source: string;
  target: string;
  /** Path estimate on the full sample. */
  estimate: number;
  group1Beta: number;
  group2Beta: number;
  diff: number;
  group1BetaMean: number;
  group2BetaMean: number;
  plsMgaP: number;
}

function subsetRows(data: Dataset, keep: readonly boolean[], invert: boolean): Dataset {
  return {
    columns: data.columns,
    values: data.values.filter((_, r) => (invert ? !keep[r] : keep[r]!)),
  };
}

/** Re-estimate the model on new data with the same specification and settings. */
function rerun(model: PlsModel, data: Dataset): PlsModel {
  return estimatePls(data, model.measurementModel, model.structuralModel, {
    innerWeights: model.innerWeights,
    missing: model.missing,
    missingValue: model.settings.missingValue,
    maxIt: model.settings.maxIt,
    stopCriterion: model.settings.stopCriterion,
  });
}

/** Per-replication coefficients of one declared path. */
function bootPathColumn(boot: BootModel, source: string, target: string, j: number): number[] {
  return boot.bootPaths.slice(0, j).map((rep) => nmGet(rep, source, target));
}

/**
 * PLS-MGA over a boolean condition (TRUE rows = group 1), as seminr's
 * `estimate_pls_mga()`. Returns one row per declared structural path.
 */
export function estimatePlsMga(
  model: PlsModel,
  condition: readonly boolean[],
  options: PlsMgaOptions = {},
): PlsMgaPath[] {
  const nboot = options.nboot ?? 2000;
  if (condition.length !== model.rawdata.values.length) {
    throw new Error("condition must have one entry per data row");
  }

  const group1Model = rerun(model, subsetRows(model.rawdata, condition, false));
  const group2Model = rerun(model, subsetRows(model.rawdata, condition, true));

  const group1Boot = bootstrapModel(group1Model, {
    nboot,
    seed: options.seed,
    indices: options.group1Indices,
  });
  const group2Boot = bootstrapModel(group2Model, {
    nboot,
    seed: options.seed,
    indices: options.group2Indices,
  });

  // PLSc may not resolve in some runs — truncate both groups to J successful boots
  const j = Math.min(group1Boot.boots, group2Boot.boots);

  return model.smMatrix.toRows().map(({ source, target }) => {
    const boot1 = bootPathColumn(group1Boot, source, target, j);
    const boot2 = bootPathColumn(group2Boot, source, target, j);
    const mean1 = mean(boot1);
    const mean2 = mean(boot2);

    // Henseler's nonparametric p: share of bootstrap pairs contradicting group1 > group2
    let favorable = 0;
    for (const b1 of boot1) {
      const left = 2 * mean1 - b1 - 2 * mean2;
      for (const b2 of boot2) if (left + b2 > 0) favorable++;
    }

    return {
      source,
      target,
      estimate: nmGet(model.pathCoef, source, target),
      group1Beta: nmGet(group1Model.pathCoef, source, target),
      group2Beta: nmGet(group2Model.pathCoef, source, target),
      diff: nmGet(group1Model.pathCoef, source, target) - nmGet(group2Model.pathCoef, source, target),
      group1BetaMean: mean1,
      group2BetaMean: mean2,
      plsMgaP: 1 - favorable / (j * j),
    };
  });
}
