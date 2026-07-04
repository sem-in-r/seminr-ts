/**
 * Measurement model specification DSL, mirroring seminr's constructs(),
 * composite(), reflective(), higher_composite(), multi_items(), single_item()
 * (specify_constructs.R).
 */

/** mmMatrix type codes (helpers-mmMatrix.R). */
export type ConstructType = "C" | "A" | "B" | "UNIT" | "HOCA" | "HOCB";

export type WeightMarker =
  | "correlation_weights"
  | "regression_weights"
  | "unit_weights"
  | "mode_plsc";

export const correlationWeights: WeightMarker = "correlation_weights";
export const regressionWeights: WeightMarker = "regression_weights";
export const unitWeights: WeightMarker = "unit_weights";
/** Alias for {@link correlationWeights} (Mode A). */
export const modeA = correlationWeights;
/** Alias for {@link regressionWeights} (Mode B). */
export const modeB = regressionWeights;
/** Mode A weights + PLSc disattenuation (type "C"), as seminr's `mode_plsc`; equivalent to `reflective()`. */
export const modePlsc: WeightMarker = "mode_plsc";

export interface ConstructSpec {
  kind: "construct";
  name: string;
  /** Indicator names; for higher-order composites, first-order construct names. */
  items: string[];
  type: ConstructType;
  /** Present only on higher-order composites. */
  method?: "two_stage";
  /** Present only on higher-order reflective constructs (CBSEM second-order factors). */
  higherOrder?: boolean;
}

// Interaction specs are closures invoked at estimation time (specify_interactions.R).
// The import is type-only, so there is no runtime cycle with ./interactions.ts.
import type { InteractionSpec } from "./interactions.ts";
export type { InteractionSpec } from "./interactions.ts";

export type MeasurementModelEntry = ConstructSpec | InteractionSpec;
export type MeasurementModel = MeasurementModelEntry[];

export interface ItemAffix {
  prefix?: string;
  mid?: string;
  suffix?: string;
}

/** Named-argument form of {@link multiItems}, mirroring R's argument names. */
export interface MultiItemsArgs extends ItemAffix {
  itemName: string;
  itemNumbers: readonly number[];
}

/** Generate numbered item names, as seminr's `multi_items()`. */
export function multiItems(args: MultiItemsArgs): string[];
export function multiItems(itemName: string, itemNumbers: readonly number[], affix?: ItemAffix): string[];
export function multiItems(
  nameOrArgs: string | MultiItemsArgs,
  maybeItemNumbers?: readonly number[],
  affix: ItemAffix = {},
): string[] {
  const { itemName, itemNumbers, prefix = "", mid = "", suffix = "" } =
    typeof nameOrArgs === "string"
      ? { itemName: nameOrArgs, itemNumbers: maybeItemNumbers!, ...affix }
      : nameOrArgs;
  return itemNumbers.map((n) => `${prefix}${itemName}${mid}${n}${suffix}`);
}

/** Wrap a single item name, as seminr's `single_item()`. */
export function singleItem(item: string): string[] {
  return [item];
}

const weightToType: Record<WeightMarker, ConstructType> = {
  correlation_weights: "A",
  regression_weights: "B",
  unit_weights: "UNIT",
  mode_plsc: "C",
};

/** Named-argument form of {@link composite}, mirroring R's argument names. */
export interface CompositeArgs {
  constructName: string;
  itemNames: readonly string[];
  weights?: WeightMarker;
}

/** Composite construct (Mode A by default), as seminr's `composite()`. */
export function composite(args: CompositeArgs): ConstructSpec;
export function composite(
  constructName: string,
  itemNames: readonly string[],
  weights?: WeightMarker,
): ConstructSpec;
export function composite(
  nameOrArgs: string | CompositeArgs,
  maybeItemNames?: readonly string[],
  maybeWeights?: WeightMarker,
): ConstructSpec {
  const { constructName, itemNames, weights = correlationWeights } =
    typeof nameOrArgs === "string"
      ? { constructName: nameOrArgs, itemNames: maybeItemNames!, weights: maybeWeights }
      : nameOrArgs;
  return {
    kind: "construct",
    name: constructName,
    items: [...itemNames],
    type: weightToType[weights],
  };
}

/** Named-argument form of {@link reflective}, mirroring R's argument names. */
export interface ReflectiveArgs {
  constructName: string;
  itemNames: readonly string[];
}

/** Reflective (common-factor) construct — estimated consistently via PLSc, as seminr's `reflective()`. */
export function reflective(args: ReflectiveArgs): ConstructSpec;
export function reflective(constructName: string, itemNames: readonly string[]): ConstructSpec;
export function reflective(
  nameOrArgs: string | ReflectiveArgs,
  maybeItemNames?: readonly string[],
): ConstructSpec {
  const { constructName, itemNames } =
    typeof nameOrArgs === "string"
      ? { constructName: nameOrArgs, itemNames: maybeItemNames! }
      : nameOrArgs;
  return {
    kind: "construct",
    name: constructName,
    items: [...itemNames],
    type: "C",
  };
}

/** Named-argument form of {@link higherComposite}, mirroring R's argument names. */
export interface HigherCompositeArgs {
  constructName: string;
  dimensions: readonly string[];
  method?: "two_stage";
  weights?: WeightMarker;
}

/** Higher-order composite over first-order constructs, as seminr's `higher_composite()`. */
export function higherComposite(args: HigherCompositeArgs): ConstructSpec;
export function higherComposite(
  constructName: string,
  dimensions: readonly string[],
  method?: "two_stage",
  weights?: WeightMarker,
): ConstructSpec;
export function higherComposite(
  nameOrArgs: string | HigherCompositeArgs,
  maybeDimensions?: readonly string[],
  maybeMethod?: "two_stage",
  maybeWeights?: WeightMarker,
): ConstructSpec {
  const {
    constructName,
    dimensions,
    method = "two_stage",
    weights = correlationWeights,
  } = typeof nameOrArgs === "string"
    ? {
        constructName: nameOrArgs,
        dimensions: maybeDimensions!,
        method: maybeMethod,
        weights: maybeWeights,
      }
    : nameOrArgs;
  const type: ConstructType =
    weights === regressionWeights ? "HOCB" : weights === unitWeights ? "UNIT" : "HOCA";
  return {
    kind: "construct",
    name: constructName,
    items: [...dimensions],
    type,
    method,
  };
}

/** Aggregate construct specifications into a measurement model, as seminr's `constructs()`. */
export function constructs(...specs: MeasurementModelEntry[]): MeasurementModel {
  return specs;
}

/** Construct entries of a measurement model, narrowed to ConstructSpec. */
export function constructSpecs(mm: MeasurementModel): ConstructSpec[] {
  return mm.filter((e): e is ConstructSpec => e.kind === "construct");
}

/** Interaction entries of a measurement model, narrowed to InteractionSpec. */
export function interactionSpecs(mm: MeasurementModel): InteractionSpec[] {
  return mm.filter((e): e is InteractionSpec => e.kind === "interaction");
}

/** Entries that are not interactions, as seminr's `all_non_interactions()`. */
export function nonInteractionSpecs(mm: MeasurementModel): MeasurementModel {
  return mm.filter((e) => e.kind !== "interaction");
}
