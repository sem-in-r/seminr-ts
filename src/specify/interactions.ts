/**
 * Interaction term specification and the three generation methods
 * (specify_interactions.R): product_indicator, orthogonal, two_stage.
 * Each method returns a build function invoked at estimation time with the
 * cleaned data; it returns new item columns plus mmMatrix rows.
 */

import { composite, modeA, type WeightMarker } from "./constructs.ts";
import type { MmMatrix, MMRow } from "../model/mmMatrix.ts";
import type { SmMatrix } from "../model/smMatrix.ts";
import { standardize } from "../math/stats.ts";
import { ols } from "../math/solve.ts";
import { getColumn, selectColumns, type ColumnMatrix, type Dataset } from "../estimate/data.ts";
import { simplePls } from "../estimate/simplePls.ts";
import { pathWeighting, type InnerWeightsFn } from "../estimate/schemes.ts";

export interface InteractionContext {
  /** Cleaned estimation data (measured items only). */
  data: Dataset;
  /** mmMatrix of the non-interaction constructs. */
  mmMatrix: MmMatrix;
  structuralModel: SmMatrix;
  innerWeights: InnerWeightsFn;
}

export interface InteractionResult {
  name: string;
  /** Generated item columns to append to the estimation data. */
  data: ColumnMatrix;
  /** mmMatrix rows measuring the interaction construct. */
  mm: MMRow[];
  ivName: string;
  moderatorName: string;
  /** Orthogonalization coefficients per product item (orthogonal method only). */
  orthoCoefs?: Record<string, Record<string, number>>;
}

export type InteractionBuildFn = (ctx: InteractionContext) => InteractionResult;

/** A method (product_indicator/orthogonal/two_stage) closes over iv/moderator/weights. */
export type InteractionMethod = (
  iv: string,
  moderator: string,
  weights?: WeightMarker,
) => InteractionBuildFn;

/** Names of the builtin interaction methods (serializable across postMessage). */
export type InteractionMethodName = "product_indicator" | "orthogonal" | "two_stage";

export interface InteractionSpec {
  kind: "interaction";
  name: string;
  build: InteractionBuildFn;
  /** Descriptor metadata, recorded so the spec can be serialized (workers). */
  iv: string;
  moderator: string;
  weights: WeightMarker;
  /** Undefined when a custom method closure was supplied (not serializable). */
  methodName?: InteractionMethodName;
}

/** Wrap generated interaction items as a composite, as seminr's `measure_interaction()`. */
function measureInteraction(name: string, items: readonly string[], weights: WeightMarker): MMRow[] {
  const spec = composite(name, items, weights);
  return spec.items.map((item) => ({ construct: name, measurement: item, type: spec.type }));
}

interface ProductItems {
  columns: string[];
  values: number[][];
  ivItems: string[];
  moderatorItems: string[];
}

/** Pairwise products of the z-scored iv and moderator items ("ivItem*modItem", iv varying slowest). */
function scaledProductItems(ctx: InteractionContext, iv: string, moderator: string): ProductItems {
  const ivItems = ctx.mmMatrix.constructItems(iv);
  const moderatorItems = ctx.mmMatrix.constructItems(moderator);
  const ivScaled = standardize(selectColumns(ctx.data, ivItems).values, ivItems).values;
  const modScaled = standardize(selectColumns(ctx.data, moderatorItems).values, moderatorItems).values;

  const columns: string[] = [];
  for (const a of ivItems) for (const b of moderatorItems) columns.push(`${a}*${b}`);

  const n = ctx.data.values.length;
  const values: number[][] = Array.from({ length: n }, (_, r) => {
    const row: number[] = [];
    for (let i = 0; i < ivItems.length; i++) {
      for (let j = 0; j < moderatorItems.length; j++) {
        row.push(ivScaled[r]![i]! * modScaled[r]![j]!);
      }
    }
    return row;
  });

  return { columns, values, ivItems, moderatorItems };
}

/** Scaled product-indicator method (Henseler & Chin 2010). */
export const productIndicator: InteractionMethod = (iv, moderator, weights = modeA) => (ctx) => {
  const name = `${iv}*${moderator}`;
  const products = scaledProductItems(ctx, iv, moderator);
  return {
    name,
    data: { columns: products.columns, values: products.values },
    mm: measureInteraction(name, products.columns, weights),
    ivName: iv,
    moderatorName: moderator,
  };
};

/**
 * Orthogonalized product indicators: each product column is replaced by the
 * residuals of regressing it (with intercept) on the unscaled iv+moderator items.
 */
export const orthogonal: InteractionMethod = (iv, moderator, weights = modeA) => (ctx) => {
  const name = `${iv}*${moderator}`;
  const products = scaledProductItems(ctx, iv, moderator);
  const predictors = [...products.ivItems, ...products.moderatorItems];
  const n = ctx.data.values.length;

  // design matrix with intercept, using ORIGINAL (unscaled) item values
  const predictorData = selectColumns(ctx.data, predictors);
  const x = predictorData.values.map((row) => [1, ...row]);

  const orthoCoefs: Record<string, Record<string, number>> = {};
  products.columns.forEach((column, j) => {
    const y = products.values.map((row) => row[j]!);
    const beta = ols(x, y);
    const coefs: Record<string, number> = { "(Intercept)": beta[0]! };
    predictors.forEach((p, k) => (coefs[p] = beta[k + 1]!));
    orthoCoefs[column] = coefs;
    for (let r = 0; r < n; r++) {
      let fitted = 0;
      for (let k = 0; k < x[r]!.length; k++) fitted += x[r]![k]! * beta[k]!;
      products.values[r]![j] = y[r]! - fitted;
    }
  });

  return {
    name,
    data: { columns: products.columns, values: products.values },
    mm: measureInteraction(name, products.columns, weights),
    ivName: iv,
    moderatorName: moderator,
    orthoCoefs,
  };
};

/**
 * Two-stage method: estimate the main-effects model first (interactions removed
 * from the structural model), then a single product column of construct scores.
 * The first stage runs with simplePLS defaults, as seminr does.
 */
export const twoStage: InteractionMethod = (iv, moderator, weights = modeA) => (ctx) => {
  const name = `${iv}*${moderator}`;
  const mainEffectsSm = ctx.structuralModel.removePathsFrom(ctx.structuralModel.allInteractions());
  const firstStage = simplePls(ctx.data, mainEffectsSm, ctx.mmMatrix, {
    innerWeights: ctx.innerWeights,
  });

  const ivScores = getColumn(
    { columns: firstStage.constructs, values: firstStage.constructScores.values },
    iv,
  );
  const modScores = getColumn(
    { columns: firstStage.constructs, values: firstStage.constructScores.values },
    moderator,
  );
  const column = `${name}_intxn`;
  return {
    name,
    data: { columns: [column], values: ivScores.map((v, r) => [v * modScores[r]!]) },
    mm: measureInteraction(name, [column], weights),
    ivName: iv,
    moderatorName: moderator,
  };
};

const builtinMethodNames = new Map<InteractionMethod, InteractionMethodName>([
  [productIndicator, "product_indicator"],
  [orthogonal, "orthogonal"],
  [twoStage, "two_stage"],
]);

/** Look up a builtin interaction method by its serialized name. */
export function interactionMethodFromName(name: InteractionMethodName): InteractionMethod {
  switch (name) {
    case "product_indicator":
      return productIndicator;
    case "orthogonal":
      return orthogonal;
    case "two_stage":
      return twoStage;
  }
}

/** Named-argument form of {@link interactionTerm}, mirroring R's argument names. */
export interface InteractionTermArgs {
  iv: string;
  moderator: string;
  method?: InteractionMethod;
  weights?: WeightMarker;
}

/** Specify an interaction construct, as seminr's `interaction_term()`. */
export function interactionTerm(args: InteractionTermArgs): InteractionSpec;
export function interactionTerm(
  iv: string,
  moderator: string,
  method?: InteractionMethod,
  weights?: WeightMarker,
): InteractionSpec;
export function interactionTerm(
  ivOrArgs: string | InteractionTermArgs,
  maybeModerator?: string,
  maybeMethod?: InteractionMethod,
  maybeWeights?: WeightMarker,
): InteractionSpec {
  const {
    iv,
    moderator,
    method = productIndicator,
    weights = modeA,
  } = typeof ivOrArgs === "string"
    ? { iv: ivOrArgs, moderator: maybeModerator!, method: maybeMethod, weights: maybeWeights }
    : ivOrArgs;
  const methodName = builtinMethodNames.get(method);
  return {
    kind: "interaction",
    name: `${iv}*${moderator}`,
    build: method(iv, moderator, weights),
    iv,
    moderator,
    weights,
    ...(methodName ? { methodName } : {}),
  };
}

/** Named-argument form of {@link quadraticTerm}, mirroring R's argument names. */
export interface QuadraticTermArgs {
  iv: string;
  method?: InteractionMethod;
  weights?: WeightMarker;
}

/** Quadratic term: the interaction of a construct with itself, as seminr's `quadratic_term()` (default method two_stage). */
export function quadraticTerm(args: QuadraticTermArgs): InteractionSpec;
export function quadraticTerm(
  iv: string,
  method?: InteractionMethod,
  weights?: WeightMarker,
): InteractionSpec;
export function quadraticTerm(
  ivOrArgs: string | QuadraticTermArgs,
  maybeMethod?: InteractionMethod,
  maybeWeights?: WeightMarker,
): InteractionSpec {
  const { iv, method = twoStage, weights = modeA } =
    typeof ivOrArgs === "string"
      ? { iv: ivOrArgs, method: maybeMethod, weights: maybeWeights }
      : ivOrArgs;
  return interactionTerm(iv, iv, method, weights);
}

export interface InteractionParams {
  ivName: string;
  moderatorName: string;
  orthoCoefs?: Record<string, Record<string, number>>;
}

export interface ProcessedInteractions {
  data: Dataset;
  mmMatrix: MmMatrix;
  interactionParams: Record<string, InteractionParams>;
}

/**
 * Invoke every interaction build function, appending the generated columns to
 * the data and rows to the mmMatrix, as seminr's `process_interactions()`.
 */
export function processInteractions(
  interactions: readonly InteractionSpec[],
  data: Dataset,
  mmMatrix: MmMatrix,
  structuralModel: SmMatrix,
  innerWeights: InnerWeightsFn = pathWeighting,
): ProcessedInteractions {
  if (interactions.length === 0) return { data, mmMatrix, interactionParams: {} };

  const ctx: InteractionContext = { data, mmMatrix, structuralModel, innerWeights };
  const columns = [...data.columns];
  const values = data.values.map((row) => [...row]);
  let mm = mmMatrix;
  const interactionParams: Record<string, InteractionParams> = {};

  for (const spec of interactions) {
    const result = spec.build(ctx);
    columns.push(...result.data.columns);
    result.data.values.forEach((row, r) => values[r]!.push(...row));
    mm = mm.appendRows(result.mm);
    interactionParams[result.name] = {
      ivName: result.ivName,
      moderatorName: result.moderatorName,
      ...(result.orthoCoefs ? { orthoCoefs: result.orthoCoefs } : {}),
    };
  }

  return { data: { columns, values }, mmMatrix: mm, interactionParams };
}
