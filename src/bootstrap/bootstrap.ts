/**
 * Bootstrapping of a PLS model (estimate_bootstrap.R:69-346) and total effects
 * (evaluate_effects.R). The boot statistics are paths, loadings, weights,
 * HTMT, and total paths — the same vector seminr carries per replication.
 */

import { estimatePls, type PlsModel } from "../estimate/estimatePls.ts";
import { htmt } from "../evaluate/validity.ts";
import { matmul, namedMatrix, nmGet, type NamedMatrix } from "../math/matrix.ts";
import { mean, sd, quantile } from "../math/stats.ts";
import type { Dataset } from "../estimate/data.ts";
import type { MeasurementModel } from "../specify/constructs.ts";
import type { SmMatrixInput } from "../model/smMatrix.ts";
import type { InnerWeightsFn } from "../estimate/schemes.ts";
import { defaultResampler, type Resampler } from "./rng.ts";

export interface BootstrapOptions {
  nboot?: number;
  /** Seed for the default resampler (defaults to a random seed). */
  seed?: number;
  /** Custom resampler producing 0-based indices per replication. */
  resampler?: Resampler;
  /** Explicit 0-based index matrix (nboot × n); overrides resampler. Use for exact R parity. */
  indices?: number[][];
}

export interface BootModel extends Omit<PlsModel, "kind"> {
  readonly kind: "boot";
  readonly bootPaths: NamedMatrix[];
  readonly bootLoadings: NamedMatrix[];
  readonly bootWeights: NamedMatrix[];
  readonly bootHtmt: NamedMatrix[];
  readonly bootTotalPaths: NamedMatrix[];
  readonly pathsDescriptives: NamedMatrix;
  readonly loadingsDescriptives: NamedMatrix;
  readonly weightsDescriptives: NamedMatrix;
  readonly htmtDescriptives: NamedMatrix;
  readonly totalPathsDescriptives: NamedMatrix;
  /** Successful replications. */
  readonly boots: number;
  /** Replications that failed to estimate and were dropped. */
  readonly fails: number;
  readonly seed: number | undefined;
}

/** Total effects: B + B² + … until the power is all zeros (acyclic models terminate exactly). */
export function totalEffects(pathCoef: NamedMatrix): NamedMatrix {
  const out = pathCoef.values.map((r) => [...r]);
  let power = pathCoef.values.map((r) => [...r]);
  const sum = (m: number[][]): number => m.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
  while (sum(power) !== 0) {
    power = matmul(power, pathCoef.values);
    for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < out[i]!.length; j++) out[i]![j]! += power[i]![j]!;
    }
  }
  return namedMatrix(pathCoef.rows, pathCoef.cols, out);
}

/** The statistics kept from one bootstrap replication. */
export interface BootReplication {
  paths: NamedMatrix;
  loadings: NamedMatrix;
  weights: NamedMatrix;
  htmt: NamedMatrix;
  totalPaths: NamedMatrix;
}

export interface BootReplicationOptions {
  innerWeights: InnerWeightsFn;
  missingValue: number | undefined;
  maxIt: number;
  stopCriterion: number;
}

/**
 * Run one bootstrap replication: resample rows, re-estimate the full model,
 * keep paths/loadings/weights/total-paths. Returns null when estimation fails
 * (e.g. a degenerate resample with zero-variance columns).
 */
export function bootReplication(
  rawdata: Dataset,
  indices: readonly number[],
  measurementModel: MeasurementModel,
  structuralModel: SmMatrixInput,
  options: BootReplicationOptions,
): BootReplication | null {
  try {
    const resampled = resampleRows(rawdata, indices);
    const fit = estimatePls(resampled, measurementModel, structuralModel, {
      innerWeights: options.innerWeights,
      missingValue: options.missingValue,
      maxIt: options.maxIt,
      stopCriterion: options.stopCriterion,
    });
    return {
      paths: fit.pathCoef,
      loadings: fit.outerLoadings,
      weights: fit.outerWeights,
      htmt: htmt(fit),
      totalPaths: totalEffects(fit.pathCoef),
    };
  } catch {
    return null;
  }
}

function resampleRows(data: Dataset, indices: readonly number[]): Dataset {
  return {
    columns: data.columns,
    values: indices.map((i) => {
      const row = data.values[i];
      if (!row) throw new Error(`Resample index out of range: ${i}`);
      return [...row];
    }),
  };
}

/** cbind(est, boot means, boot SDs) with "PLS Est." / "Boot Mean" / "Boot SD" column names. */
function buildDescriptives(
  estimate: NamedMatrix,
  replications: readonly NamedMatrix[],
  filterZero: boolean,
): NamedMatrix {
  const rows = estimate.rows;
  const cols = estimate.cols;
  const means = namedMatrix(rows, cols);
  const sds = namedMatrix(rows, cols);
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < cols.length; j++) {
      const values = replications.map((rep) => rep.values[i]![j]!);
      means.values[i]![j] = mean(values);
      sds.values[i]![j] = sd(values);
    }
  }

  let keptRows = rows.map((_, i) => i);
  let keptCols = cols.map((_, j) => j);
  if (filterZero) {
    const blocks = [estimate, means, sds];
    const cellNonZero = (i: number, j: number): boolean =>
      blocks.some((b) => b.values[i]![j] !== 0);
    keptRows = keptRows.filter((i) => keptCols.some((j) => cellNonZero(i, j)));
    keptCols = keptCols.filter((j) => keptRows.some((i) => cellNonZero(i, j)));
  }

  const outRows = keptRows.map((i) => rows[i]!);
  const outCols: string[] = [];
  const outValues: number[][] = keptRows.map(() => []);
  for (const [block, parameter] of [
    [estimate, "PLS Est."],
    [means, "Boot Mean"],
    [sds, "Boot SD"],
  ] as const) {
    for (const j of keptCols) {
      outCols.push(`${cols[j]} ${parameter}`);
      keptRows.forEach((i, r) => outValues[r]!.push(block.values[i]![j]!));
    }
  }
  return namedMatrix(outRows, outCols, outValues);
}

/** Resolve nboot/seed/resampler and generate the per-replication index arrays. */
export function resolveResamplePlan(
  model: PlsModel,
  options: BootstrapOptions,
): { nboot: number; indices: number[][]; seed: number | undefined } {
  const nboot = options.nboot ?? 500;
  const seed = options.seed ?? Math.floor(Math.random() * 100000);
  const resampler: Resampler = options.indices
    ? (_n, i) => options.indices![i]!
    : (options.resampler ?? defaultResampler(seed));
  const n = model.rawdata.values.length;
  return {
    nboot,
    indices: Array.from({ length: nboot }, (_, i) => resampler(n, i)),
    seed: options.indices || options.resampler ? undefined : seed,
  };
}

/** Assemble a BootModel from per-replication results (nulls = failed replications). */
export function summarizeBootstrap(
  model: PlsModel,
  replications: readonly (BootReplication | null)[],
  seed: number | undefined,
): BootModel {
  const kept = replications.filter((r): r is BootReplication => r !== null);
  const bootPaths = kept.map((r) => r.paths);
  const bootLoadings = kept.map((r) => r.loadings);
  const bootWeights = kept.map((r) => r.weights);
  const bootHtmt = kept.map((r) => r.htmt);
  const bootTotalPaths = kept.map((r) => r.totalPaths);
  return {
    ...model,
    kind: "boot",
    bootPaths,
    bootLoadings,
    bootWeights,
    bootHtmt,
    bootTotalPaths,
    pathsDescriptives: buildDescriptives(model.pathCoef, bootPaths, true),
    loadingsDescriptives: buildDescriptives(model.outerLoadings, bootLoadings, false),
    weightsDescriptives: buildDescriptives(model.outerWeights, bootWeights, false),
    htmtDescriptives: buildDescriptives(htmt(model), bootHtmt, false),
    totalPathsDescriptives: buildDescriptives(totalEffects(model.pathCoef), bootTotalPaths, true),
    boots: kept.length,
    fails: replications.length - kept.length,
    seed,
  };
}

/** Named-argument form of {@link bootstrapModel} (`model` mirrors R's `seminr_model`). */
export interface BootstrapModelArgs extends BootstrapOptions {
  model: PlsModel;
}

/** Bootstrap a fitted PLS model, as seminr's `bootstrap_model()` (single-threaded). */
export function bootstrapModel(args: BootstrapModelArgs): BootModel;
export function bootstrapModel(model: PlsModel, options?: BootstrapOptions): BootModel;
export function bootstrapModel(
  modelOrArgs: PlsModel | BootstrapModelArgs,
  positionalOptions: BootstrapOptions = {},
): BootModel {
  const named = "model" in modelOrArgs;
  const model = named ? (modelOrArgs as BootstrapModelArgs).model : (modelOrArgs as PlsModel);
  const options: BootstrapOptions = named
    ? (modelOrArgs as BootstrapModelArgs)
    : positionalOptions;
  const plan = resolveResamplePlan(model, options);
  const replicationOptions: BootReplicationOptions = {
    innerWeights: model.innerWeights,
    missingValue: model.settings.missingValue,
    maxIt: model.settings.maxIt,
    stopCriterion: model.settings.stopCriterion,
  };
  const replications = plan.indices.map((indices) =>
    bootReplication(model.rawdata, indices, model.measurementModel, model.structuralModel, replicationOptions),
  );
  return summarizeBootstrap(model, replications, plan.seed);
}

/**
 * t-values from a descriptives matrix: PLS Est. / Boot SD, per source row and
 * outcome column (columns are grouped "X PLS Est." / "X Boot Mean" / "X Boot SD").
 */
export function bootTValues(descriptives: NamedMatrix): NamedMatrix {
  const estCols = descriptives.cols.filter((c) => c.endsWith(" PLS Est."));
  const outcomes = estCols.map((c) => c.slice(0, -" PLS Est.".length));
  const t = namedMatrix(descriptives.rows, outcomes);
  for (const row of descriptives.rows) {
    for (const outcome of outcomes) {
      const est = nmGet(descriptives, row, `${outcome} PLS Est.`);
      const bootSd = nmGet(descriptives, row, `${outcome} Boot SD`);
      t.values[descriptives.rows.indexOf(row)]![outcomes.indexOf(outcome)] = est / bootSd;
    }
  }
  return t;
}

export interface PercentileCIs {
  lower: NamedMatrix;
  upper: NamedMatrix;
}

/** Percentile confidence intervals (R type-7 quantiles) from per-replication matrices. */
export function bootPercentileCIs(replications: readonly NamedMatrix[], alpha = 0.05): PercentileCIs {
  const first = replications[0];
  if (!first) throw new Error("No bootstrap replications to summarize");
  const lower = namedMatrix(first.rows, first.cols);
  const upper = namedMatrix(first.rows, first.cols);
  for (let i = 0; i < first.rows.length; i++) {
    for (let j = 0; j < first.cols.length; j++) {
      const values = replications.map((rep) => rep.values[i]![j]!);
      lower.values[i]![j] = quantile(values, alpha / 2);
      upper.values[i]![j] = quantile(values, 1 - alpha / 2);
    }
  }
  return { lower, upper };
}
