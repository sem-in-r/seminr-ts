/**
 * PLSpredict evaluation metrics: per-item RMSE/MAE tables
 * (feature_plspredict.R:548-574, 807-811) and construct-level error metrics
 * plus the predict summary (report_summary.R:142-181).
 */

import { namedMatrix, nmGet, type NamedMatrix } from "../math/matrix.ts";
import { mean } from "../math/stats.ts";
import type { PlsPrediction } from "./predictPls.ts";

/** RMSE | MAE rows per column of a residual matrix. */
function residualMetrics(residuals: NamedMatrix): NamedMatrix {
  const values = residuals.cols.map((_, j) => {
    const col = residuals.values.map((row) => row[j]!);
    return [Math.sqrt(mean(col.map((v) => v * v))), mean(col.map(Math.abs))];
  });
  return namedMatrix(
    ["RMSE", "MAE"],
    residuals.cols,
    [values.map((v) => v[0]!), values.map((v) => v[1]!)],
  );
}

export interface PlsPredictItemMetrics {
  plsInSample: NamedMatrix;
  plsOutOfSample: NamedMatrix;
  lmInSample: NamedMatrix;
  lmOutOfSample: NamedMatrix;
}

/** RMSE/MAE for PLS and LM predictions, in and out of sample. */
export function itemMetrics(prediction: PlsPrediction): PlsPredictItemMetrics {
  return {
    plsInSample: residualMetrics(prediction.items.plsInSampleResiduals),
    plsOutOfSample: residualMetrics(prediction.items.plsOutOfSampleResiduals),
    lmInSample: residualMetrics(prediction.items.lmInSampleResiduals),
    lmOutOfSample: residualMetrics(prediction.items.lmOutOfSampleResiduals),
  };
}

/** Construct-level MSE/MAE vs the reference scores, plus the overfit ratio. */
export function constructMetrics(prediction: PlsPrediction): NamedMatrix {
  const endogenous = prediction.model.smMatrix.allEndogenous();
  const { compositeInSample, compositeOutOfSample, actualsStar } = prediction.composites;
  const values = endogenous.map((construct) => {
    const diffs = actualsStar.values.map((row, r) => {
      const actual = nmGet(actualsStar, actualsStar.rows[r]!, construct);
      return {
        is: actual - nmGet(compositeInSample, compositeInSample.rows[r]!, construct),
        oos: actual - nmGet(compositeOutOfSample, compositeOutOfSample.rows[r]!, construct),
      };
    });
    const isMse = mean(diffs.map((d) => d.is * d.is));
    const isMae = mean(diffs.map((d) => Math.abs(d.is)));
    const oosMse = mean(diffs.map((d) => d.oos * d.oos));
    const oosMae = mean(diffs.map((d) => Math.abs(d.oos)));
    return [isMse, isMae, oosMse, oosMae, (oosMse - isMse) / isMse];
  });
  return namedMatrix(
    ["IS_MSE", "IS_MAE", "OOS_MSE", "OOS_MAE", "overfit"],
    endogenous,
    ["IS_MSE", "IS_MAE", "OOS_MSE", "OOS_MAE", "overfit"].map((_, i) =>
      values.map((v) => v[i]!),
    ),
  );
}

export interface PlsPredictSummary {
  plsInSample: NamedMatrix;
  plsOutOfSample: NamedMatrix;
  lmInSample: NamedMatrix;
  lmOutOfSample: NamedMatrix;
  constructError: NamedMatrix;
  /** Out-of-sample PLS residuals per indicator (for error distributions). */
  predictionError: NamedMatrix;
}

/** Summarize a PLSpredict result, as seminr's `summary.predict_pls_model`. */
export function summarizePlsPredict(prediction: PlsPrediction): PlsPredictSummary {
  const items = itemMetrics(prediction);
  return {
    plsInSample: items.plsInSample,
    plsOutOfSample: items.plsOutOfSample,
    lmInSample: items.lmInSample,
    lmOutOfSample: items.lmOutOfSample,
    constructError: constructMetrics(prediction),
    predictionError: prediction.items.plsOutOfSampleResiduals,
  };
}
