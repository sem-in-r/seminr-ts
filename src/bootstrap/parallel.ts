/**
 * Parallel bootstrap on the Web Worker API (`new Worker` + postMessage), which
 * Bun implements natively and browsers support — the same code path runs in
 * both. Replication indices are generated up-front on the main thread and
 * chunked contiguously across workers, so the result is identical to the
 * sequential `bootstrapModel` for the same seed/resampler/indices.
 */

import type { PlsModel } from "../estimate/estimatePls.ts";
import { serializeEstimationSpec } from "../workers/spec.ts";
import { chunkContiguously, defaultWorkerCount, runChunkInWorker } from "../workers/pool.ts";
import {
  resolveResamplePlan,
  summarizeBootstrap,
  type BootModel,
  type BootstrapOptions,
} from "./bootstrap.ts";
import type { BootstrapWorkerRequest, BootstrapWorkerResponse } from "./chunk.ts";

export interface ParallelBootstrapOptions extends BootstrapOptions {
  /** Number of workers to spawn (default: hardwareConcurrency − 1, capped at nboot). */
  workers?: number;
  /**
   * Factory for worker instances. Defaults to spawning this package's shared
   * `workers/worker` module. Browser bundlers that emit the worker at a
   * different URL should pass their own factory, e.g.
   * `() => new Worker(new URL("semints-worker.js", import.meta.url), { type: "module" })`.
   */
  createWorker?: () => Worker;
}

function defaultCreateWorker(): Worker {
  // Bun resolves the .js specifier to worker.ts when running from source; in
  // the compiled dist, workers/worker.js is a real module. The literal
  // `new Worker(new URL(...))` form stays statically analyzable by bundlers.
  return new Worker(new URL("../workers/worker.js", import.meta.url), { type: "module" });
}

/** Named-argument form of {@link bootstrapModelParallel} (`model` mirrors R's `seminr_model`). */
export interface BootstrapModelParallelArgs extends ParallelBootstrapOptions {
  model: PlsModel;
}

/**
 * Bootstrap a fitted PLS model across Web Workers. Same statistics and
 * semantics as {@link bootstrapModel}; only wall-clock time differs.
 */
export async function bootstrapModelParallel(args: BootstrapModelParallelArgs): Promise<BootModel>;
export async function bootstrapModelParallel(
  model: PlsModel,
  options?: ParallelBootstrapOptions,
): Promise<BootModel>;
export async function bootstrapModelParallel(
  modelOrArgs: PlsModel | BootstrapModelParallelArgs,
  positionalOptions: ParallelBootstrapOptions = {},
): Promise<BootModel> {
  const named = "model" in modelOrArgs;
  const model = named
    ? (modelOrArgs as BootstrapModelParallelArgs).model
    : (modelOrArgs as PlsModel);
  const options: ParallelBootstrapOptions = named
    ? (modelOrArgs as BootstrapModelParallelArgs)
    : positionalOptions;
  const plan = resolveResamplePlan(model, options);
  const base = {
    kind: "bootstrap" as const,
    data: model.rawdata,
    structuralModel: model.structuralModel.toRows(),
    ...serializeEstimationSpec(model),
  };
  const workers = Math.min(Math.max(1, options.workers ?? defaultWorkerCount()), plan.nboot);
  const createWorker = options.createWorker ?? defaultCreateWorker;

  const responses = await Promise.all(
    chunkContiguously(plan.indices, workers).map((indices) =>
      runChunkInWorker<BootstrapWorkerRequest, BootstrapWorkerResponse>(createWorker, {
        ...base,
        indices,
      }),
    ),
  );
  return summarizeBootstrap(
    model,
    responses.flatMap((response) => response.replications),
    plan.seed,
  );
}
