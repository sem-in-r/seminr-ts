/**
 * The package's single worker entry — a module Web Worker that runs in Bun
 * and browsers, dispatching on the request's `kind` discriminator (bootstrap
 * replications or PLSpredict folds). Protocol: one request in, one response
 * out; the spawning side terminates the worker. Bundlers only ever have to
 * ship this one worker asset.
 */

import { runBootstrapChunk, type BootstrapWorkerRequest } from "../bootstrap/chunk.ts";
import { runPredictFoldChunk, type PredictWorkerRequest } from "../predict/chunk.ts";

type WorkerRequest = BootstrapWorkerRequest | PredictWorkerRequest;

// Typed structurally so the library compiles without DOM/WebWorker libs.
const workerScope = globalThis as unknown as {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  postMessage(message: unknown): void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  workerScope.postMessage(
    request.kind === "predict" ? runPredictFoldChunk(request) : runBootstrapChunk(request),
  );
};
