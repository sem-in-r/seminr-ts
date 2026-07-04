/**
 * Parallel bootstrap on the Web Worker API (`new Worker` + postMessage), which
 * Bun implements natively and browsers support — the same code path runs in
 * both. Replication indices are generated up-front on the main thread and
 * chunked contiguously across workers, so the result is identical to the
 * sequential `bootstrapModel` for the same seed/resampler/indices.
 */

import { missingStrategyName, type PlsModel } from "../estimate/estimatePls.ts";
import { serializeMeasurementModel, innerWeightsName } from "../specify/serialize.ts";
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
   * Factory for worker instances. Defaults to spawning this package's
   * `bootstrap/worker` module next to this file. Browser bundlers that emit
   * the worker at a different URL should pass their own factory, e.g.
   * `() => new Worker(new URL("semints-worker.js", import.meta.url), { type: "module" })`.
   */
  createWorker?: () => Worker;
}

function defaultWorkerCount(): number {
  const hardware =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  return hardware && hardware > 1 ? hardware - 1 : 4;
}

function defaultCreateWorker(): Worker {
  // Bun resolves the .js specifier to worker.ts when running from source; in
  // the compiled dist, worker.js is a real sibling module. The literal
  // `new Worker(new URL(...))` form stays statically analyzable by bundlers.
  return new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
}

function runChunkInWorker(
  createWorker: () => Worker,
  request: BootstrapWorkerRequest,
): Promise<BootstrapWorkerResponse> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    const done = (finish: () => void): void => {
      worker.terminate();
      finish();
    };
    worker.onmessage = (event: MessageEvent) =>
      done(() => resolve(event.data as BootstrapWorkerResponse));
    worker.onerror = (event: ErrorEvent) =>
      done(() => reject(event.error ?? new Error(`Bootstrap worker failed: ${event.message}`)));
    worker.postMessage(request);
  });
}

/** Split items into `parts` contiguous chunks whose sizes differ by at most one. */
function chunkContiguously<T>(items: readonly T[], parts: number): T[][] {
  const chunks: T[][] = [];
  for (let p = 0; p < parts; p++) {
    const start = Math.floor((p * items.length) / parts);
    const end = Math.floor(((p + 1) * items.length) / parts);
    if (end > start) chunks.push(items.slice(start, end));
  }
  return chunks;
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
    data: model.rawdata,
    measurementModel: serializeMeasurementModel(model.measurementModel),
    structuralModel: model.structuralModel.toRows(),
    settings: model.settings,
    innerWeights: innerWeightsName(model.innerWeights),
    missing: missingStrategyName(model.missing),
  };
  const workers = Math.min(Math.max(1, options.workers ?? defaultWorkerCount()), plan.nboot);
  const createWorker = options.createWorker ?? defaultCreateWorker;

  const responses = await Promise.all(
    chunkContiguously(plan.indices, workers).map((indices) =>
      runChunkInWorker(createWorker, { ...base, indices }),
    ),
  );
  return summarizeBootstrap(
    model,
    responses.flatMap((response) => response.replications),
    plan.seed,
  );
}
