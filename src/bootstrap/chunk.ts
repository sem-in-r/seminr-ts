/**
 * The unit of work one bootstrap worker performs. Pure module (no worker
 * globals) so the chunk logic is directly testable and reusable; the message
 * types double as the worker protocol. Everything in the request/response is
 * plain data — safe to structured-clone across postMessage.
 */

import type { Dataset } from "../estimate/data.ts";
import type { SMRow } from "../specify/relationships.ts";
import { estimationInputs, type SerializedEstimationSpec } from "../workers/spec.ts";
import { bootReplication, type BootReplication } from "./bootstrap.ts";

export interface BootstrapWorkerRequest extends SerializedEstimationSpec {
  /** Discriminator for the shared dispatching worker. */
  kind: "bootstrap";
  data: Dataset;
  structuralModel: readonly Readonly<SMRow>[];
  /** 0-based resample row indices, one array per replication in this chunk. */
  indices: number[][];
}

export interface BootstrapWorkerResponse {
  /** One entry per requested replication, in order; null = failed replication. */
  replications: (BootReplication | null)[];
}

/** Run every replication of one chunk (used by the worker; testable inline). */
export function runBootstrapChunk(request: BootstrapWorkerRequest): BootstrapWorkerResponse {
  const { measurementModel, options } = estimationInputs(request);
  return {
    replications: request.indices.map((indices) =>
      bootReplication(request.data, indices, measurementModel, request.structuralModel, options),
    ),
  };
}
