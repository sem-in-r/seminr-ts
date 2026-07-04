/**
 * Re-estimate a fitted PLS model with selectively overridden inputs, as
 * seminr's `rerun.pls_model` (estimate_pls.R:227-300): every argument
 * defaults to the value stored on the fitted model.
 */

import type { Dataset } from "./data.ts";
import type { MeasurementModel } from "../specify/constructs.ts";
import type { SmMatrixInput } from "../model/smMatrix.ts";
import type { InnerWeightsFn } from "./schemes.ts";
import {
  estimatePls,
  type MissingDataStrategy,
  type PlsModel,
} from "./estimatePls.ts";

export interface RerunOverrides {
  data?: Dataset;
  measurementModel?: MeasurementModel;
  structuralModel?: SmMatrixInput;
  innerWeights?: InnerWeightsFn;
  missing?: MissingDataStrategy;
  missingValue?: number;
  maxIt?: number;
  stopCriterion?: number;
}

export function rerun(model: PlsModel, overrides: RerunOverrides = {}): PlsModel {
  return estimatePls(
    overrides.data ?? model.rawdata,
    overrides.measurementModel ?? model.measurementModel,
    overrides.structuralModel ?? model.structuralModel,
    {
      innerWeights: overrides.innerWeights ?? model.innerWeights,
      missing: overrides.missing ?? model.missing,
      missingValue: overrides.missingValue ?? model.settings.missingValue,
      maxIt: overrides.maxIt ?? model.settings.maxIt,
      stopCriterion: overrides.stopCriterion ?? model.settings.stopCriterion,
    },
  );
}
