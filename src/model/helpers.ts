/**
 * Public model-traversal helpers, as seminr's exported accessors:
 * `all_factors`/`all_composites` (helpers-model.R:123-136),
 * `construct_names.seminr_model` (helpers-model.R:19-29),
 * `construct_items.seminr_model` (helpers-model.R:33-35),
 * `construct_type` (helpers-model.R:50-64), and
 * `construct_mode` (helpers-mmMatrix.R:107-109).
 */

import type { PlsModel } from "../estimate/estimatePls.ts";
import type { ConstructType } from "../specify/constructs.ts";
import { constructsInModel } from "../evaluate/constructsInModel.ts";
import { isInteraction } from "./smMatrix.ts";
import type { MmMatrix } from "./mmMatrix.ts";

/** Constructs estimated as common factors (reflective measurement). */
export function allFactors(model: PlsModel): string[] {
  const reflective = new Set(model.mmMatrix.allConstructsOfMode("C"));
  return model.constructs.filter((c) => reflective.has(c));
}

/** Constructs estimated as composites (i.e. not reflective common factors). */
export function allComposites(model: PlsModel): string[] {
  const factors = new Set(allFactors(model));
  return model.constructs.filter((c) => !factors.has(c));
}

/** Construct names in the model: structural ∩ measurement, with first-stage names for HOC models. */
export function constructNames(model: PlsModel): string[] {
  return constructsInModel(model).names;
}

/** Measured item names of a construct. */
export function constructItems(model: PlsModel, construct: string): string[] {
  return model.mmMatrix.constructItems(construct);
}

/** User-facing measurement type of a construct: mm type code, or "interaction". */
export function constructType(model: PlsModel, construct: string): ConstructType | "interaction" {
  if (isInteraction(construct)) return "interaction";
  for (const entry of model.measurementModel) {
    if (entry.kind === "construct" && entry.name === construct) return entry.type;
  }
  throw new Error(`Unknown construct: ${construct}`);
}

/** Measurement mode (mm type code) of a construct from the measurement-model matrix. */
export function constructMode(mmMatrix: MmMatrix, construct: string): ConstructType {
  return mmMatrix.constructMode(construct);
}
