/**
 * Serialization of model specifications for postMessage boundaries (Slice 9).
 * ConstructSpec is already plain data; InteractionSpec carries a closure, so it
 * maps to a descriptor and is rebuilt with `interactionTerm` on the other side.
 * Only the builtin interaction methods and inner-weight schemes are supported —
 * custom closures cannot cross a worker boundary.
 */

import type { ConstructSpec, MeasurementModel, WeightMarker } from "./constructs.ts";
import {
  interactionTerm,
  interactionMethodFromName,
  type InteractionMethodName,
} from "./interactions.ts";
import { pathWeighting, pathFactorial, type InnerWeightsFn } from "../estimate/schemes.ts";

export interface SerializedInteractionSpec {
  kind: "interaction";
  name: string;
  iv: string;
  moderator: string;
  method: InteractionMethodName;
  weights: WeightMarker;
}

export type SerializedMeasurementModelEntry = ConstructSpec | SerializedInteractionSpec;
export type SerializedMeasurementModel = SerializedMeasurementModelEntry[];

/** Map a measurement model to plain, structured-cloneable data. */
export function serializeMeasurementModel(mm: MeasurementModel): SerializedMeasurementModel {
  return mm.map((entry) => {
    if (entry.kind === "construct") return entry;
    if (!entry.methodName) {
      throw new Error(
        `Interaction "${entry.name}" uses a custom interaction method closure, which cannot ` +
          "be serialized for a worker. Use a builtin method (productIndicator, orthogonal, twoStage).",
      );
    }
    return {
      kind: "interaction",
      name: entry.name,
      iv: entry.iv,
      moderator: entry.moderator,
      method: entry.methodName,
      weights: entry.weights,
    };
  });
}

/** Rebuild a measurement model (including interaction closures) from serialized form. */
export function deserializeMeasurementModel(mm: SerializedMeasurementModel): MeasurementModel {
  return mm.map((entry) =>
    entry.kind === "construct"
      ? entry
      : interactionTerm(entry.iv, entry.moderator, interactionMethodFromName(entry.method), entry.weights),
  );
}

export type InnerWeightsName = "path_weighting" | "path_factorial";

/** Serialize a builtin inner-weights scheme to its name. */
export function innerWeightsName(fn: InnerWeightsFn): InnerWeightsName {
  if (fn === pathWeighting) return "path_weighting";
  if (fn === pathFactorial) return "path_factorial";
  throw new Error(
    "Custom inner-weights functions cannot be serialized for a worker. " +
      "Use pathWeighting or pathFactorial.",
  );
}

/** Look up a builtin inner-weights scheme by its serialized name. */
export function innerWeightsFromName(name: InnerWeightsName): InnerWeightsFn {
  return name === "path_weighting" ? pathWeighting : pathFactorial;
}
