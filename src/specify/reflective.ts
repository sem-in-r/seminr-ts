/**
 * Reflective coercion and higher-order reflective constructs for CBSEM,
 * mirroring seminr's as.reflective() (helpers-mmMatrix.R:273-363) and
 * higher_reflective() (specify_constructs.R:210-214).
 */

import { reflective, type ConstructSpec, type MeasurementModel } from "./constructs.ts";

/**
 * Coerce every construct in a measurement model to reflective type "C".
 * Interaction specs pass through unchanged (seminr coerces their generated
 * mm rows at estimation time instead).
 */
export function asReflective(mm: MeasurementModel): MeasurementModel {
  return mm.map((entry) =>
    entry.kind === "construct" ? { ...entry, type: "C" as const } : entry,
  );
}

/**
 * Second-order reflective construct whose "items" are first-order construct
 * names; renders as `HOC =~ FirstOrder1 + ...` in lavaan syntax.
 */
export function higherReflective(
  constructName: string,
  dimensions: readonly string[],
): ConstructSpec {
  return { ...reflective(constructName, dimensions), higherOrder: true };
}
