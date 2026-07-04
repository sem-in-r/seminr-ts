/**
 * PLS model summary, assembling the same report seminr's
 * `summary.seminr_model` builds (report_summary.R:3-33): paths report, total
 * (indirect) effects, loadings/weights, validity and reliability metrics,
 * composite scores, f-squared, descriptives, information criteria, and the
 * missing-data report (compute_metrics.R:114-152).
 */

import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import { version } from "../version.ts";
import { totalEffects } from "../bootstrap/bootstrap.ts";
import { meanReplacement, type PlsModel } from "../estimate/estimatePls.ts";
import { isInteraction } from "../model/smMatrix.ts";
import { constructsInModel } from "./constructsInModel.ts";
import { reliabilityTable } from "./reliability.ts";
import {
  htmt,
  flCriteriaTable,
  crossLoadings,
  itemVifs,
  plsAntecedentVifs,
} from "./validity.ts";
import {
  modelFsquares,
  reportPaths,
  totalIndirectEffects,
  itCriteria,
} from "./effects.ts";
import { descriptives, type PlsDescriptives } from "./descriptives.ts";

export interface PlsValiditySummary {
  vifItems: Record<string, Record<string, number>>;
  /** HTMT stored transposed (lower triangle), as summary.seminr_model does. */
  htmt: NamedMatrix;
  flCriteria: NamedMatrix;
  crossLoadings: NamedMatrix;
}

export interface MissingVariableSummary {
  variable: string;
  missingCount: number;
  missingProportion: number;
}

export interface MissingDataSummary {
  method: string;
  /** Rows dropped by an omitting strategy (absent for mean replacement). */
  nRemoved?: number;
  summary: MissingVariableSummary[];
}

export interface PlsSummary {
  meta: { engine: "semints"; version: string };
  iterations: number;
  paths: NamedMatrix;
  totalEffects: NamedMatrix;
  totalIndirectEffects: NamedMatrix;
  loadings: NamedMatrix;
  weights: NamedMatrix;
  validity: PlsValiditySummary;
  reliability: NamedMatrix;
  compositeScores: NamedMatrix | null;
  vifAntecedents: Record<string, Record<string, number>>;
  fSquare: NamedMatrix;
  descriptives: PlsDescriptives;
  itCriteria: NamedMatrix;
  missingData: MissingDataSummary;
}

function transposeNamed(m: NamedMatrix): NamedMatrix {
  const values = m.cols.map((_, j) => m.rows.map((_, i) => m.values[i]![j]!));
  return namedMatrix(m.cols, m.rows, values);
}

/** Scores of composite-mode constructs only; null when the model has none. */
function compositeScores(model: PlsModel): NamedMatrix | null {
  const compositeModes = ["A", "B", "HOCA", "HOCB", "UNIT"] as const;
  const mmComposites = new Set(
    compositeModes.flatMap((mode) => model.mmMatrix.allConstructsOfMode(mode)),
  );
  const used = model.constructs.filter((c) => mmComposites.has(c));
  if (used.length === 0) return null;
  const scores = model.constructScores;
  const idx = used.map((c) => scores.cols.indexOf(c));
  return namedMatrix(
    scores.rows,
    used,
    scores.values.map((row) => idx.map((j) => row[j]!)),
  );
}

/** Missing-data report, as seminr's `report_missing()`. */
export function reportMissing(model: PlsModel): MissingDataSummary {
  const method = model.missing === meanReplacement ? "mean_replacement" : "na.omit";
  const mmVariables = model.firstStageModel
    ? model.firstStageModel.mmVariables
    : model.mmVariables;
  const rawColumns = new Set(model.rawdata.columns);
  const variables = mmVariables.filter((v) => !isInteraction(v) && rawColumns.has(v));

  const summary = variables.map((variable) => {
    const j = model.rawdata.columns.indexOf(variable);
    let missing = 0;
    for (const row of model.rawdata.values) {
      const v = row[j];
      if (v === null || v === undefined || Number.isNaN(v)) missing++;
    }
    return {
      variable,
      missingCount: missing,
      missingProportion: missing / model.rawdata.values.length,
    };
  });

  const report: MissingDataSummary = { method, summary };
  if (method !== "mean_replacement") {
    report.nRemoved = model.rawdata.values.length - model.data.values.length;
  }
  return report;
}

/** Summarize a fitted PLS model, as seminr's `summary()` on a pls_model. */
export function summarizePls(model: PlsModel): PlsSummary {
  const mc = constructsInModel(model);
  return {
    meta: { engine: "semints", version },
    iterations: model.iterations,
    paths: reportPaths(model),
    totalEffects: totalEffects(model.pathCoef),
    totalIndirectEffects: totalIndirectEffects(model.pathCoef),
    loadings: model.outerLoadings,
    weights: model.outerWeights,
    validity: {
      vifItems: itemVifs(model, mc),
      htmt: transposeNamed(htmt(model)),
      flCriteria: flCriteriaTable(model, mc),
      crossLoadings: crossLoadings(model, mc),
    },
    reliability: reliabilityTable(model),
    compositeScores: compositeScores(model),
    vifAntecedents: plsAntecedentVifs(model, mc),
    fSquare: modelFsquares(model),
    descriptives: descriptives(model),
    itCriteria: itCriteria(model),
    missingData: reportMissing(model),
  };
}
