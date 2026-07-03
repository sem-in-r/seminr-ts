/**
 * semints — PLS-SEM estimation in TypeScript, ported from the seminr R package.
 *
 * Typical usage: specify a measurement model with {@link constructs} and a
 * structural model with {@link relationships}, estimate with
 * {@link estimatePls}, and resample with {@link bootstrapModel}.
 */

export const version = "0.1.0";

// Model specification DSL
export {
  constructs,
  composite,
  reflective,
  higherComposite,
  multiItems,
  singleItem,
  correlationWeights,
  regressionWeights,
  unitWeights,
  modeA,
  modeB,
  type WeightMarker,
  type ConstructType,
  type ConstructSpec,
  type InteractionSpec,
  type MeasurementModel,
  type MeasurementModelEntry,
  type CompositeArgs,
  type ReflectiveArgs,
  type HigherCompositeArgs,
  type MultiItemsArgs,
  type ItemAffix,
} from "./specify/constructs.ts";
export {
  relationships,
  paths,
  type SMRow,
  type SMMatrix,
  type PathsArgs,
} from "./specify/relationships.ts";
export {
  interactionTerm,
  quadraticTerm,
  productIndicator,
  orthogonal,
  twoStage,
  type InteractionMethod,
  type InteractionParams,
  type InteractionTermArgs,
  type QuadraticTermArgs,
} from "./specify/interactions.ts";

// Model matrices and validation
export { buildMmMatrix, type MMRow, type MMMatrix } from "./model/mmMatrix.ts";
export { assessModelSpecification } from "./model/validate.ts";

// Estimation
export {
  estimatePls,
  meanReplacement,
  type PlsModel,
  type EstimatePlsOptions,
  type EstimatePlsArgs,
  type MissingDataStrategy,
} from "./estimate/estimatePls.ts";
export {
  simplePls,
  type SimplePlsModel,
  type SimplePlsOptions,
} from "./estimate/simplePls.ts";
export {
  pathWeighting,
  pathFactorial,
  type InnerWeightsFn,
  type OuterModeFn,
} from "./estimate/schemes.ts";
export { rhoA } from "./estimate/consistent.ts";
export type { Dataset } from "./estimate/data.ts";
export { parseCsv } from "./data/csv.ts";

// Bootstrapping
export {
  bootstrapModel,
  totalEffects,
  bootTValues,
  bootPercentileCIs,
  type BootModel,
  type BootstrapOptions,
  type BootstrapModelArgs,
  type BootReplication,
  type PercentileCIs,
} from "./bootstrap/bootstrap.ts";
export {
  bootstrapModelParallel,
  type ParallelBootstrapOptions,
  type BootstrapModelParallelArgs,
} from "./bootstrap/parallel.ts";
export {
  runBootstrapChunk,
  type BootstrapWorkerRequest,
  type BootstrapWorkerResponse,
} from "./bootstrap/chunk.ts";
export { mulberry32, defaultResampler, type Resampler } from "./bootstrap/rng.ts";

// postMessage-safe model spec descriptors (used by the worker bootstrap)
export {
  serializeMeasurementModel,
  deserializeMeasurementModel,
  innerWeightsName,
  innerWeightsFromName,
  type SerializedMeasurementModel,
  type SerializedMeasurementModelEntry,
  type SerializedInteractionSpec,
  type InnerWeightsName,
} from "./specify/serialize.ts";

// Named-matrix helpers (model results carry named rows/columns)
export { namedMatrix, nmGet, nmSet, type NamedMatrix } from "./math/matrix.ts";
