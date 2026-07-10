/**
 * seminr-ts — PLS-SEM estimation in TypeScript, ported from the seminr R package.
 *
 * Typical usage: specify a measurement model with {@link constructs} and a
 * structural model with {@link relationships}, estimate with
 * {@link estimatePls}, and resample with {@link bootstrapModel}.
 */

export { version } from "./version.ts";

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
  modePlsc,
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
  constructSpecs,
  interactionSpecs,
  nonInteractionSpecs,
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
export { MmMatrix, type MMRow } from "./model/mmMatrix.ts";
export { SmMatrix, isInteraction, type SmMatrixInput } from "./model/smMatrix.ts";
export { assessModelSpecification } from "./model/validate.ts";
export {
  allFactors,
  allComposites,
  constructNames,
  constructItems,
  constructType,
  constructMode,
} from "./model/helpers.ts";

// Estimation
export {
  estimatePls,
  meanReplacement,
  naOmit,
  missingStrategyName,
  missingStrategyFromName,
  type MissingStrategyName,
  type PlsModel,
  type EstimatePlsOptions,
  type EstimatePlsArgs,
  type EstimatePlsModelArgs,
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
export { rerun, type RerunOverrides } from "./estimate/rerun.ts";
export {
  columnIndex,
  getColumn,
  selectColumns,
  type Dataset,
  type ColumnMatrix,
} from "./estimate/data.ts";
export { parseCsv } from "./data/csv.ts";

// PLS model evaluation (reliability/validity/effects/descriptives) and summary
export { constructsInModel, type ConstructsInModel } from "./evaluate/constructsInModel.ts";
export { cronbachsAlpha, reliabilityTable } from "./evaluate/reliability.ts";
export {
  htmt,
  flCriteriaTable,
  crossLoadings,
  itemVifs,
  plsAntecedentVifs,
} from "./evaluate/validity.ts";
export {
  fSquared,
  modelFsquares,
  reportPaths,
  totalIndirectEffects,
  itCriteria,
  computeItCriteriaWeights,
} from "./evaluate/effects.ts";
export { desc, descriptives, type PlsDescriptives } from "./evaluate/descriptives.ts";
export {
  summarizePls,
  reportMissing,
  type PlsSummary,
  type PlsValiditySummary,
  type MissingDataSummary,
  type MissingVariableSummary,
} from "./evaluate/summarizePls.ts";

// Direct out-of-sample prediction (no cross-validation)
export {
  predict,
  type PredictModelOptions,
  type PredictedModel,
} from "./predict/predict.ts";

// PLSpredict (cross-validated predictions + LM benchmark)
export {
  predictPls,
  cutFolds,
  type PredictPlsOptions,
  type PredictPlsArgs,
  type PlsPrediction,
  type PlsPredictionComposites,
  type PlsPredictionItems,
} from "./predict/predictPls.ts";
export {
  predictDA,
  predictEA,
  constructOrder,
  type PredictTechnique,
} from "./predict/techniques.ts";
export {
  itemMetrics,
  constructMetrics,
  summarizePlsPredict,
  type PlsPredictItemMetrics,
  type PlsPredictSummary,
} from "./predict/metrics.ts";
export {
  predictPlsParallel,
  type ParallelPredictPlsOptions,
  type PredictPlsParallelArgs,
} from "./predict/parallel.ts";
export {
  runPredictFoldChunk,
  type PredictWorkerRequest,
  type PredictWorkerResponse,
} from "./predict/chunk.ts";
export {
  predictTechniqueName,
  predictTechniqueFromName,
  type PredictTechniqueName,
} from "./predict/techniques.ts";

// PLS-MGA (multi-group analysis)
export {
  estimatePlsMga,
  estimatePlsMgaParallel,
  type PlsMgaOptions,
  type PlsMgaParallelOptions,
  type PlsMgaPath,
} from "./mga/estimatePlsMga.ts";

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
  summarizePlsBoot,
  parseBootArray,
  parseBootArrayHtmt,
  bootPathsDf,
  type PlsBootSummary,
} from "./bootstrap/summarize.ts";
export {
  specificEffectSignificance,
  totalIndirectCi,
  type SpecificEffectSignificance,
  type SpecificEffectOptions,
  type TotalIndirectCi,
  type TotalIndirectCiOptions,
} from "./bootstrap/mediation.ts";
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

// -----------------------------------------------------------------------------
// Covariance-based SEM (CBSEM/CFA), mirroring seminr's estimate_cbsem/estimate_cfa
// -----------------------------------------------------------------------------

// Specification extensions
export {
  associations,
  itemErrors,
  hasAssociations,
  associationPairs,
  associationItems,
  type ItemAssociations,
  type ItemPair,
} from "./specify/associations.ts";
export { asReflective, higherReflective } from "./specify/reflective.ts";
export {
  specifyModel,
  isSpecifiedModel,
  type SpecifiedModel,
  type SpecifyModelArgs,
} from "./specify/specifyModel.ts";
export { csem2seminr, lavaan2seminr } from "./specify/importLavaanSyntax.ts";

// Estimation
export {
  estimateCfa,
  type CfaModel,
  type CbsemEstimation,
  type CbsemEstimator,
  type EstimateCfaArgs,
  type EstimateCfaModelArgs,
  type EstimateCbBaseOptions,
} from "./cbsem/estimateCfa.ts";
export { type RobustLayer } from "./cbsem/robust.ts";
export {
  estimateCbsem,
  type CbsemModel,
  type EstimateCbsemArgs,
  type EstimateCbsemModelArgs,
} from "./cbsem/estimateCbsem.ts";

// Summaries and metrics
export {
  summarize,
  summarizeCfa,
  summarizeCbsem,
  type CfaSummary,
  type CbsemSummary,
} from "./cbsem/summarize.ts";
export { rhoCAve, antecedentVifs } from "./cbsem/summary.ts";
export { fitMeasures } from "./cbsem/fitMeasures.ts";
export { tenBergeScores, type TenBergeResult } from "./cbsem/tenBerge.ts";
export {
  parameterEstimatesTable,
  standardizedSolutionTable,
  mlStandardErrors,
  type SolutionRow,
  type StandardizedRow,
} from "./cbsem/standardErrors.ts";

// lavaan syntax equivalents (the `lavaanModel` field of the model objects)
export {
  lavaanModelSyntax,
  lavaanifyName,
  unlavaanifyName,
} from "./cbsem/lavaanSyntax.ts";

// Plotting (DOT/Graphviz path diagrams, themes, HTMT)
export {
  seminrThemeCreate,
  seminrThemeDefault,
  seminrThemeAcademic,
  seminrThemeSmart,
  seminrThemeDark,
  seminrThemeGet,
  seminrThemeSet,
  seminrThemeReset,
  nodeEndoTemplateDefault,
  nodeExoTemplateDefault,
  edgeTemplateDefault,
  edgeTemplateMinimal,
  type SeminrTheme,
  type SeminrThemeOptions,
  type ThemeArrow,
} from "./plot/theme.ts";
export {
  dotGraph,
  type DotGraphOptions,
  type PlottableModel,
} from "./plot/dotGraph.ts";
export { dotGraphHtmt, type DotGraphHtmtOptions } from "./plot/htmt.ts";
export {
  plot,
  plotHtmt,
  savePlot,
  lastSeminrPlot,
  setLastSeminrPlot,
  SeminrPlot,
  type SaveOptions,
  type SavePlotOptions,
} from "./plot/plot.ts";
export { renderSvg, rendererAvailable, type RenderOptions } from "./plot/render.ts";
export {
  plotScores,
  scoresColumns,
  type ScoredModel,
} from "./plot/charts/scores.ts";
export { plotReliabilityTable } from "./plot/charts/reliability.ts";
export {
  slopeAnalysis,
  plotInteraction,
  slopeSeries,
  type LegendPlace,
  type PathModel,
  type SlopeSeries,
} from "./plot/charts/slopes.ts";
export {
  plotPredictError,
  nrd0Bandwidth,
  densityEstimate,
  type DensityEstimate,
  type PredictErrorSource,
} from "./plot/charts/predictError.ts";
export { SvgPlot } from "./plot/charts/svg.ts";
