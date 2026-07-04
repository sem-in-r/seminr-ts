/**
 * Bundled model specification and component extraction, mirroring seminr's
 * specify_model()/extract_models() (specify_models.R:21-43).
 */

import type { MeasurementModel } from "./constructs.ts";
import type { ItemAssociations } from "./associations.ts";
import type { SmMatrixInput } from "../model/smMatrix.ts";

export interface SpecifiedModel {
  kind: "specified";
  measurementModel: MeasurementModel;
  structuralModel?: SmMatrixInput;
  itemAssociations?: ItemAssociations;
}

/** Named-argument form of {@link specifyModel}, mirroring R's argument names. */
export interface SpecifyModelArgs {
  measurementModel: MeasurementModel;
  structuralModel?: SmMatrixInput;
  itemAssociations?: ItemAssociations;
}

/** Bundle model components, as seminr's `specify_model()`. */
export function specifyModel(args: SpecifyModelArgs): SpecifiedModel;
export function specifyModel(
  measurementModel: MeasurementModel,
  structuralModel?: SmMatrixInput,
  itemAssociations?: ItemAssociations,
): SpecifiedModel;
export function specifyModel(
  mmOrArgs: MeasurementModel | SpecifyModelArgs,
  maybeStructuralModel?: SmMatrixInput,
  maybeItemAssociations?: ItemAssociations,
): SpecifiedModel {
  const { measurementModel, structuralModel, itemAssociations } = Array.isArray(mmOrArgs)
    ? {
        measurementModel: mmOrArgs,
        structuralModel: maybeStructuralModel,
        itemAssociations: maybeItemAssociations,
      }
    : mmOrArgs;
  return {
    kind: "specified",
    measurementModel,
    ...(structuralModel !== undefined ? { structuralModel } : {}),
    ...(itemAssociations !== undefined ? { itemAssociations } : {}),
  };
}

export function isSpecifiedModel(x: unknown): x is SpecifiedModel {
  return (
    typeof x === "object" &&
    x !== null &&
    !Array.isArray(x) &&
    (x as { kind?: unknown }).kind === "specified"
  );
}

export interface ExtractedModels {
  measurementModel?: MeasurementModel;
  structuralModel?: SmMatrixInput;
  itemAssociations?: ItemAssociations;
}

/**
 * Resolve components against an optional bundle: explicitly passed components
 * override the bundle's, as seminr's `extract_models()`.
 */
export function extractModels(
  model: SpecifiedModel | undefined,
  measurementModel?: MeasurementModel,
  structuralModel?: SmMatrixInput,
  itemAssociations?: ItemAssociations,
): ExtractedModels {
  return {
    measurementModel: measurementModel ?? model?.measurementModel,
    structuralModel: structuralModel ?? model?.structuralModel,
    itemAssociations: itemAssociations ?? model?.itemAssociations,
  };
}
