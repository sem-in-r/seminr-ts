/**
 * Bootstrap worker entry — a module Web Worker that runs in Bun and browsers.
 * Protocol: receives one BootstrapWorkerRequest, replies with one
 * BootstrapWorkerResponse. The spawning side terminates the worker.
 */

import { runBootstrapChunk, type BootstrapWorkerRequest } from "./chunk.ts";

// Typed structurally so the library compiles without DOM/WebWorker libs.
const workerScope = globalThis as unknown as {
  onmessage: ((event: { data: BootstrapWorkerRequest }) => void) | null;
  postMessage(message: unknown): void;
};

workerScope.onmessage = (event) => {
  workerScope.postMessage(runBootstrapChunk(event.data));
};
