/** estimate_pls orchestration (seminr estimate_pls.R:103-206) and missing-data handling (clean_data.R). */

import { interactionSpecs, type MeasurementModel } from "../specify/constructs.ts";
import {
  processInteractions,
  type InteractionParams,
} from "../specify/interactions.ts";
import { MmMatrix, measurementModelItems } from "../model/mmMatrix.ts";
import { SmMatrix, type SmMatrixInput } from "../model/smMatrix.ts";
import {
  extractModels,
  isSpecifiedModel,
  type SpecifiedModel,
} from "../specify/specifyModel.ts";
import { validateSingleItemModeB, missingDataReport } from "../model/validate.ts";
import { mean } from "../math/stats.ts";
import { selectColumns, type Dataset } from "./data.ts";
import { simplePls, type SimplePlsModel } from "./simplePls.ts";
import { modelConsistent } from "./consistent.ts";
import {
  hocSpecs,
  prepareHigherOrderModel,
  combineFirstOrderSecondOrderMatrices,
} from "./higherOrder.ts";
import { pathWeighting, type InnerWeightsFn } from "./schemes.ts";
import { DEFAULT_MAX_IT, DEFAULT_STOP_CRITERION, MISSING_WARNING_SHARE } from "./constants.ts";

export interface MissingDataStrategy {
  (data: Dataset): { data: Dataset; warnings: string[] };
}

/**
 * Replace missing cells (null/NaN) with the column mean of non-missing values,
 * warning when a column is more than 5% missing (seminr's `mean_replacement`).
 */
export const meanReplacement: MissingDataStrategy = (data) => {
  // fast path: complete data has nothing to replace — return it unchanged
  // (bootstrap replications hit this once per resample)
  const complete = data.values.every((row) =>
    row.every((v) => v !== null && v !== undefined && !Number.isNaN(v)),
  );
  if (complete) return { data, warnings: [] };

  const warnings: string[] = [];
  const n = data.values.length;
  const values = data.values.map((row) => [...row]);
  data.columns.forEach((name, j) => {
    const present: number[] = [];
    let missing = 0;
    for (const row of values) {
      const v = row[j];
      if (v === null || v === undefined || Number.isNaN(v)) missing++;
      else present.push(v);
    }
    if (missing === 0) return;
    if (missing / n > MISSING_WARNING_SHARE) {
      warnings.push(
        `${((missing / n) * 100).toFixed(1)}% of data missing for indicator ${name}. ` +
          "Mean replacement may have reduced variability.",
      );
    }
    const colMean = mean(present);
    for (const row of values) {
      const v = row[j];
      if (v === null || v === undefined || Number.isNaN(v)) row[j] = colMean;
    }
  });
  return { data: { columns: data.columns, values }, warnings };
};

/**
 * Drop rows containing any missing cell (null/NaN), as passing
 * `stats::na.omit` to seminr's `missing` argument. The raw data keeps all
 * rows; only the estimation data shrinks.
 */
export const naOmit: MissingDataStrategy = (data) => ({
  data: {
    columns: data.columns,
    values: data.values.filter((row) =>
      row.every((v) => v !== null && v !== undefined && !Number.isNaN(v)),
    ),
  },
  warnings: [],
});

/** Serializable names for the builtin strategies (worker boundary). */
export type MissingStrategyName = "mean_replacement" | "na_omit";

export function missingStrategyName(fn: MissingDataStrategy): MissingStrategyName {
  if (fn === naOmit) return "na_omit";
  if (fn === meanReplacement) return "mean_replacement";
  throw new Error(
    "Custom missing-data strategies cannot cross the worker boundary; use the sequential bootstrapModel",
  );
}

export function missingStrategyFromName(name: MissingStrategyName): MissingDataStrategy {
  return name === "na_omit" ? naOmit : meanReplacement;
}

export interface EstimatePlsOptions {
  innerWeights?: InnerWeightsFn;
  missing?: MissingDataStrategy;
  /** Marker value in the raw data that denotes a missing observation. */
  missingValue?: number;
  maxIt?: number;
  stopCriterion?: number;
}

export interface PlsSettings {
  readonly missingValue: number | undefined;
  readonly maxIt: number;
  readonly stopCriterion: number;
}

export interface PlsModel extends SimplePlsModel {
  readonly kind: "pls";
  /** Data actually estimated on: measured items, cleaned (and later augmented). */
  readonly data: Dataset;
  /** Input data with missing markers replaced by NaN. */
  readonly rawdata: Dataset;
  readonly measurementModel: MeasurementModel;
  readonly structuralModel: SmMatrix;
  readonly settings: PlsSettings;
  /**
   * Missing-data strategy used during estimation (kept outside `settings` so
   * settings stay structured-clone safe for the worker bootstrap).
   */
  readonly missing: MissingDataStrategy;
  /** Messages produced during estimation (missing-data report, cleaning warnings). */
  readonly warnings: string[];
  /** Per-interaction parameters (iv/moderator names, ortho coefficients), when interactions exist. */
  readonly interactionParams?: Record<string, InteractionParams>;
  /** First-stage model when the model contains higher-order constructs. */
  readonly firstStageModel?: PlsModel;
  /** True when the model contains higher-order constructs. */
  readonly hoc?: boolean;
}

function replaceMissingMarkers(data: Dataset, missingValue: number | undefined): Dataset {
  if (missingValue === undefined) return data;
  return {
    columns: data.columns,
    values: data.values.map((row) => row.map((v) => (v === missingValue ? Number.NaN : v))),
  };
}

/** Named-argument form of {@link estimatePls}, mirroring R's argument names. */
export interface EstimatePlsArgs extends EstimatePlsOptions {
  data: Dataset;
  measurementModel: MeasurementModel;
  structuralModel: SmMatrixInput;
}

/** Named-argument form carrying a {@link SpecifiedModel}; components override the bundle. */
export interface EstimatePlsModelArgs extends EstimatePlsOptions {
  data: Dataset;
  model: SpecifiedModel;
  measurementModel?: MeasurementModel;
  structuralModel?: SmMatrixInput;
}

/** Estimate a PLS-SEM model, as seminr's `estimate_pls()`. */
export function estimatePls(args: EstimatePlsArgs | EstimatePlsModelArgs): PlsModel;
export function estimatePls(
  data: Dataset,
  model: SpecifiedModel,
  options?: EstimatePlsOptions,
): PlsModel;
export function estimatePls(
  data: Dataset,
  measurementModel: MeasurementModel,
  structuralModel: SmMatrixInput,
  options?: EstimatePlsOptions,
): PlsModel;
export function estimatePls(
  dataOrArgs: Dataset | EstimatePlsArgs | EstimatePlsModelArgs,
  mmOrModel?: MeasurementModel | SpecifiedModel,
  smOrOptions?: SmMatrixInput | EstimatePlsOptions,
  positionalOptions: EstimatePlsOptions = {},
): PlsModel {
  const named = "data" in dataOrArgs;
  let data: Dataset;
  let mm: MeasurementModel | undefined;
  let smInput: SmMatrixInput | undefined;
  let options: EstimatePlsOptions;
  if (named) {
    const args = dataOrArgs as EstimatePlsArgs & Partial<EstimatePlsModelArgs>;
    data = args.data;
    const extracted = extractModels(args.model, args.measurementModel, args.structuralModel);
    mm = extracted.measurementModel;
    smInput = extracted.structuralModel;
    options = args;
  } else if (isSpecifiedModel(mmOrModel)) {
    data = dataOrArgs as Dataset;
    const extracted = extractModels(mmOrModel);
    mm = extracted.measurementModel;
    smInput = extracted.structuralModel;
    options = (smOrOptions as EstimatePlsOptions | undefined) ?? {};
  } else {
    data = dataOrArgs as Dataset;
    mm = mmOrModel as MeasurementModel;
    smInput = smOrOptions as SmMatrixInput;
    options = positionalOptions;
  }
  if (!mm) throw new Error("A measurement model is required (directly or via a specified model).");
  if (!smInput) throw new Error("A structural model is required (directly or via a specified model).");
  const measurementModel = mm;
  const structuralModel = SmMatrix.from(smInput);
  const {
    innerWeights = pathWeighting,
    missing = meanReplacement,
    missingValue,
    maxIt = DEFAULT_MAX_IT,
    stopCriterion = DEFAULT_STOP_CRITERION,
  } = options;

  const warnings: string[] = [];
  const rawdata = replaceMissingMarkers(data, missingValue);

  // subset to measured (lower-order) items only
  const measuredItems = measurementModelItems(measurementModel);
  const subset = selectColumns(rawdata, measuredItems);

  const cleaned = missing(subset);
  warnings.push(...cleaned.warnings);
  let estimationData = cleaned.data;

  // two-stage higher-order constructs: first stage replaces HOCs with their
  // dimensions; dimension scores become observable columns for stage two
  const hocs = hocSpecs(measurementModel, structuralModel);
  let firstStageModel: PlsModel | undefined;
  if (hocs.length > 0) {
    const prepared = prepareHigherOrderModel(
      estimationData,
      measurementModel,
      structuralModel,
      innerWeights,
      maxIt,
      stopCriterion,
    );
    estimationData = prepared.data;
    firstStageModel = prepared.firstStageModel;
  }

  let mmMatrix = MmMatrix.fromMeasurementModel(measurementModel);

  const interactions = interactionSpecs(measurementModel);
  const processed = processInteractions(
    interactions,
    estimationData,
    mmMatrix,
    structuralModel,
    innerWeights,
  );
  estimationData = processed.data;
  mmMatrix = processed.mmMatrix;

  validateSingleItemModeB(mmMatrix);
  // seminr reports on the data AFTER the missing strategy ran (evaluate_warnings.R)
  warnings.push(missingDataReport(estimationData.values, estimationData.columns, mmMatrix));

  const core = simplePls(estimationData, structuralModel, mmMatrix, {
    innerWeights,
    maxIt,
    stopCriterion,
  });

  const model: PlsModel = {
    kind: "pls",
    ...core,
    data: estimationData,
    rawdata: missingValue === undefined ? data : rawdata,
    measurementModel,
    structuralModel,
    settings: { missingValue, maxIt, stopCriterion },
    missing,
    warnings,
    ...(interactions.length > 0 ? { interactionParams: processed.interactionParams } : {}),
  };

  const consistent = modelConsistent(model);
  if (!firstStageModel) return consistent;

  const combined = combineFirstOrderSecondOrderMatrices(firstStageModel, consistent, mmMatrix);
  return {
    ...consistent,
    firstStageModel,
    hoc: true,
    outerLoadings: combined.outerLoadings,
    outerWeights: combined.outerWeights,
  };
}
