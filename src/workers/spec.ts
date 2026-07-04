/**
 * The estimation spec a fitted model contributes to a worker request, and its
 * reconstruction into `EstimatePlsOptions` on the worker side. Shared by the
 * bootstrap and PLSpredict protocols so a new estimation setting only has to
 * be threaded through here. `data` and the structural model stay with the
 * callers (bootstrap ships `structuralModel`/`rawdata`, predict ships
 * `smMatrix`/`data`).
 */

import {
  missingStrategyFromName,
  missingStrategyName,
  type MissingDataStrategy,
  type MissingStrategyName,
  type PlsModel,
  type PlsSettings,
} from "../estimate/estimatePls.ts";
import type { InnerWeightsFn } from "../estimate/schemes.ts";
import {
  deserializeMeasurementModel,
  innerWeightsFromName,
  innerWeightsName,
  serializeMeasurementModel,
  type InnerWeightsName,
  type SerializedMeasurementModel,
} from "../specify/serialize.ts";
import type { MeasurementModel } from "../specify/constructs.ts";

export interface SerializedEstimationSpec {
  measurementModel: SerializedMeasurementModel;
  settings: PlsSettings;
  innerWeights: InnerWeightsName;
  missing: MissingStrategyName;
}

export function serializeEstimationSpec(model: PlsModel): SerializedEstimationSpec {
  return {
    measurementModel: serializeMeasurementModel(model.measurementModel),
    settings: model.settings,
    innerWeights: innerWeightsName(model.innerWeights),
    missing: missingStrategyName(model.missing),
  };
}

/** Fully-resolved estimation options (every field concrete, unlike `EstimatePlsOptions`). */
export interface ResolvedEstimationOptions {
  innerWeights: InnerWeightsFn;
  missing: MissingDataStrategy;
  missingValue: number | undefined;
  maxIt: number;
  stopCriterion: number;
}

/** Rebuild the estimation inputs a chunk runner needs from a serialized spec. */
export function estimationInputs(spec: SerializedEstimationSpec): {
  measurementModel: MeasurementModel;
  options: ResolvedEstimationOptions;
} {
  return {
    measurementModel: deserializeMeasurementModel(spec.measurementModel),
    options: {
      innerWeights: innerWeightsFromName(spec.innerWeights),
      missing: missingStrategyFromName(spec.missing),
      missingValue: spec.settings.missingValue,
      maxIt: spec.settings.maxIt,
      stopCriterion: spec.settings.stopCriterion,
    },
  };
}
