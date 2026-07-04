/**
 * Shared Web Worker plumbing for the parallel bootstrap and PLSpredict
 * variants: worker-count default, contiguous chunking, and the
 * one-request/one-response worker round trip. The `defaultCreateWorker`
 * factories stay in the calling modules — a `new Worker(new URL(...))`
 * literal must sit next to its worker asset for bundlers to detect it.
 */

export function defaultWorkerCount(): number {
  const hardware =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  return hardware && hardware > 1 ? hardware - 1 : 4;
}

/** Post one request to a fresh worker, resolve with its single response, terminate. */
export function runChunkInWorker<Request, Response>(
  createWorker: () => Worker,
  request: Request,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    const done = (finish: () => void): void => {
      worker.terminate();
      finish();
    };
    worker.onmessage = (event: MessageEvent) => done(() => resolve(event.data as Response));
    worker.onerror = (event: ErrorEvent) =>
      done(() => reject(event.error ?? new Error(`Worker failed: ${event.message}`)));
    worker.postMessage(request);
  });
}

/** Split items into `parts` contiguous chunks whose sizes differ by at most one. */
export function chunkContiguously<T>(items: readonly T[], parts: number): T[][] {
  const chunks: T[][] = [];
  for (let p = 0; p < parts; p++) {
    const start = Math.floor((p * items.length) / parts);
    const end = Math.floor(((p + 1) * items.length) / parts);
    if (end > start) chunks.push(items.slice(start, end));
  }
  return chunks;
}
