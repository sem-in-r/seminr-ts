/** estimate_pls orchestration (seminr estimate_pls.R:103-206) and missing-data handling (clean_data.R). */

import type { MeasurementModel, InteractionSpec } from "../specify/constructs.ts";
import {
  processInteractions,
  type InteractionParams,
} from "../specify/interactions.ts";
import type { SMMatrix } from "../specify/relationships.ts";
import { buildMmMatrix, measurementModelItems, type MMMatrix } from "../model/mmMatrix.ts";
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

export interface EstimatePlsOptions {
  innerWeights?: InnerWeightsFn;
  missing?: MissingDataStrategy;
  /** Marker value in the raw data that denotes a missing observation. */
  missingValue?: number;
  maxIt?: number;
  stopCriterion?: number;
}

export interface PlsSettings {
  missingValue: number | undefined;
  maxIt: number;
  stopCriterion: number;
}

export interface PlsModel extends SimplePlsModel {
  /** Data actually estimated on: measured items, cleaned (and later augmented). */
  data: Dataset;
  /** Input data with missing markers replaced by NaN. */
  rawdata: Dataset;
  measurementModel: MeasurementModel;
  structuralModel: SMMatrix;
  settings: PlsSettings;
  /** Messages produced during estimation (missing-data report, cleaning warnings). */
  warnings: string[];
  /** Per-interaction parameters (iv/moderator names, ortho coefficients), when interactions exist. */
  interactionParams?: Record<string, InteractionParams>;
  /** First-stage model when the model contains higher-order constructs. */
  firstStageModel?: PlsModel;
  /** True when the model contains higher-order constructs. */
  hoc?: boolean;
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
  structuralModel: SMMatrix;
}

/** Estimate a PLS-SEM model, as seminr's `estimate_pls()`. */
export function estimatePls(args: EstimatePlsArgs): PlsModel;
export function estimatePls(
  data: Dataset,
  measurementModel: MeasurementModel,
  structuralModel: SMMatrix,
  options?: EstimatePlsOptions,
): PlsModel;
export function estimatePls(
  dataOrArgs: Dataset | EstimatePlsArgs,
  maybeMeasurementModel?: MeasurementModel,
  maybeStructuralModel?: SMMatrix,
  positionalOptions: EstimatePlsOptions = {},
): PlsModel {
  const named = "data" in dataOrArgs;
  const data = named ? (dataOrArgs as EstimatePlsArgs).data : (dataOrArgs as Dataset);
  const measurementModel = named
    ? (dataOrArgs as EstimatePlsArgs).measurementModel
    : maybeMeasurementModel!;
  const structuralModel = named
    ? (dataOrArgs as EstimatePlsArgs).structuralModel
    : maybeStructuralModel!;
  const options: EstimatePlsOptions = named
    ? (dataOrArgs as EstimatePlsArgs)
    : positionalOptions;
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

  let mmMatrix: MMMatrix = buildMmMatrix(measurementModel);

  const interactions = measurementModel.filter(
    (e): e is InteractionSpec => e.kind === "interaction",
  );
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
  warnings.push(missingDataReport(subset.values, subset.columns, mmMatrix));

  const core = simplePls(estimationData, structuralModel, mmMatrix, {
    innerWeights,
    maxIt,
    stopCriterion,
  });

  const model: PlsModel = {
    ...core,
    data: estimationData,
    rawdata: missingValue === undefined ? data : rawdata,
    measurementModel,
    structuralModel,
    settings: { missingValue, maxIt, stopCriterion },
    warnings,
    ...(interactions.length > 0 ? { interactionParams: processed.interactionParams } : {}),
  };

  const consistent = modelConsistent(model);

  if (firstStageModel) {
    consistent.firstStageModel = firstStageModel;
    consistent.hoc = true;
    const combined = combineFirstOrderSecondOrderMatrices(firstStageModel, consistent, mmMatrix);
    consistent.outerLoadings = combined.outerLoadings;
    consistent.outerWeights = combined.outerWeights;
  }

  return consistent;
}
