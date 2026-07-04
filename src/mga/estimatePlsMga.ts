/**
 * PLS-MGA: significance of path differences between two data subgroups
 * (estimate_pls_mga.R:45-120; Henseler, Ringle & Sinkovics 2009). Each group
 * is re-estimated and bootstrapped; the p-value per path compares the two
 * bootstrap distributions nonparametrically.
 */

import type { PlsModel } from "../estimate/estimatePls.ts";
import { rerun } from "../estimate/rerun.ts";
import { bootstrapModel, type BootModel } from "../bootstrap/bootstrap.ts";
import {
  bootstrapModelParallel,
  type ParallelBootstrapOptions,
} from "../bootstrap/parallel.ts";
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

export interface PlsMgaParallelOptions extends PlsMgaOptions {
  /**
   * Workers per group bootstrap (see {@link bootstrapModelParallel}). Both
   * groups bootstrap concurrently, so up to 2× this many workers run at once.
   */
  workers?: number;
  createWorker?: ParallelBootstrapOptions["createWorker"];
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

/** Per-replication coefficients of one declared path. */
function bootPathColumn(boot: BootModel, source: string, target: string, j: number): number[] {
  return boot.bootPaths.slice(0, j).map((rep) => nmGet(rep, source, target));
}

function splitGroups(
  model: PlsModel,
  condition: readonly boolean[],
): { group1Model: PlsModel; group2Model: PlsModel } {
  if (condition.length !== model.rawdata.values.length) {
    throw new Error("condition must have one entry per data row");
  }
  return {
    group1Model: rerun(model, { data: subsetRows(model.rawdata, condition, false) }),
    group2Model: rerun(model, { data: subsetRows(model.rawdata, condition, true) }),
  };
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
  const { group1Model, group2Model } = splitGroups(model, condition);

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

  return mgaPaths(model, group1Model, group2Model, group1Boot, group2Boot);
}

/**
 * PLS-MGA with each group's bootstrap distributed across Web Workers (the
 * equivalent of seminr's `cores` pass-through to `bootstrap_model`). Same
 * results as {@link estimatePlsMga}; only wall-clock time differs.
 */
export async function estimatePlsMgaParallel(
  model: PlsModel,
  condition: readonly boolean[],
  options: PlsMgaParallelOptions = {},
): Promise<PlsMgaPath[]> {
  const nboot = options.nboot ?? 2000;
  const { group1Model, group2Model } = splitGroups(model, condition);

  const [group1Boot, group2Boot] = await Promise.all([
    bootstrapModelParallel(group1Model, {
      nboot,
      seed: options.seed,
      indices: options.group1Indices,
      workers: options.workers,
      createWorker: options.createWorker,
    }),
    bootstrapModelParallel(group2Model, {
      nboot,
      seed: options.seed,
      indices: options.group2Indices,
      workers: options.workers,
      createWorker: options.createWorker,
    }),
  ]);

  return mgaPaths(model, group1Model, group2Model, group1Boot, group2Boot);
}

/** Beta table + Henseler p-values from the two group bootstraps. */
function mgaPaths(
  model: PlsModel,
  group1Model: PlsModel,
  group2Model: PlsModel,
  group1Boot: BootModel,
  group2Boot: BootModel,
): PlsMgaPath[] {
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
