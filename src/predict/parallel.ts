/**
 * Parallel PLSpredict on the Web Worker API (the equivalent of seminr's
 * `predict_pls(..., cores)`). Folds are chunked contiguously across workers;
 * the result is identical to the sequential `predictPls` for the same
 * ordering/folds — only wall-clock time differs.
 */

import type { PlsModel } from "../estimate/estimatePls.ts";
import { serializeEstimationSpec } from "../workers/spec.ts";
import { chunkContiguously, defaultWorkerCount, runChunkInWorker } from "../workers/pool.ts";
import type { PredictFoldSpec, PredictWorkerRequest, PredictWorkerResponse } from "./chunk.ts";
import {
  assemblePrediction,
  resolvePredictPlan,
  type PlsPrediction,
  type PredictPlsOptions,
} from "./predictPls.ts";
import { predictTechniqueName } from "./techniques.ts";

export interface ParallelPredictPlsOptions extends PredictPlsOptions {
  /** Number of workers to spawn (default: hardwareConcurrency − 1, capped at noFolds). */
  workers?: number;
  /** Factory for worker instances (see `bootstrapModelParallel` for bundler notes). */
  createWorker?: () => Worker;
}

function defaultCreateWorker(): Worker {
  return new Worker(new URL("../workers/worker.js", import.meta.url), { type: "module" });
}

/** Named-argument form of {@link predictPlsParallel} (`model` mirrors R's argument). */
export interface PredictPlsParallelArgs extends ParallelPredictPlsOptions {
  model: PlsModel;
}

/**
 * Cross-validated PLS predictions across Web Workers. Same statistics and
 * semantics as {@link predictPls}; only wall-clock time differs.
 */
export async function predictPlsParallel(args: PredictPlsParallelArgs): Promise<PlsPrediction>;
export async function predictPlsParallel(
  model: PlsModel,
  options?: ParallelPredictPlsOptions,
): Promise<PlsPrediction>;
export async function predictPlsParallel(
  modelOrArgs: PlsModel | PredictPlsParallelArgs,
  positionalOptions: ParallelPredictPlsOptions = {},
): Promise<PlsPrediction> {
  const named = "model" in modelOrArgs;
  const model = named
    ? (modelOrArgs as PredictPlsParallelArgs).model
    : (modelOrArgs as PlsModel);
  const options: ParallelPredictPlsOptions = named
    ? (modelOrArgs as PredictPlsParallelArgs)
    : positionalOptions;

  const plan = resolvePredictPlan(model, options);
  const base = {
    kind: "predict" as const,
    data: model.data,
    structuralModel: model.smMatrix.toRows(),
    ...serializeEstimationSpec(model),
    technique: predictTechniqueName(plan.technique),
    noIntVars: plan.noIntVars,
    endogenous: plan.endogenous,
  };
  const workers = Math.min(Math.max(1, options.workers ?? defaultWorkerCount()), plan.noFolds);
  const createWorker = options.createWorker ?? defaultCreateWorker;

  const chunks = chunkContiguously<PredictFoldSpec>(plan.foldSpecs, workers);
  const responses = await Promise.all(
    chunks.map((folds) =>
      runChunkInWorker<PredictWorkerRequest, PredictWorkerResponse>(createWorker, {
        ...base,
        folds,
      }),
    ),
  );
  return assemblePrediction(
    model,
    plan,
    responses.flatMap((response) => response.folds),
  );
}
