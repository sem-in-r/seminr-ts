/**
 * Summary objects for CFA/CBSEM models, mirroring seminr's summary() shape:
 * fit measures, reliability (rhoC/AVE), loadings, structural coefficients
 * with an R^2 row, antecedent VIFs, and construct correlations.
 */

import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import type { SmMatrix } from "../model/smMatrix.ts";
import { lavaanifyName } from "./lavaanSyntax.ts";
import { rhoCAve, antecedentVifs } from "./summary.ts";
import {
  parameterEstimatesTable,
  standardizedSolutionTable,
  type SolutionRow,
  type StandardizedRow,
} from "./standardErrors.ts";
import type { CfaModel } from "./estimateCfa.ts";
import type { CbsemModel } from "./estimateCbsem.ts";
import type { PlsModel } from "../estimate/estimatePls.ts";
import { summarizePls, type PlsSummary } from "../evaluate/summarizePls.ts";
import type { BootModel } from "../bootstrap/bootstrap.ts";
import { summarizePlsBoot, type PlsBootSummary } from "../bootstrap/summarize.ts";

export interface CfaSummary {
  fit: Record<string, number>;
  reliability: NamedMatrix;
  loadings: NamedMatrix;
  /** Standardized solution rows (est.std/se/z/p/ci) for all parameters. */
  solution: StandardizedRow[];
  estimates: SolutionRow[];
}

export interface CbsemSummary extends CfaSummary {
  /** R^2 row + standardized coefficients, antecedents x outcomes (seminr keeps lavaanified names here). */
  pathsCoefficients: NamedMatrix;
  /** Structural (and measurement) standardized rows — filter op === "~" for paths. */
  paths: StandardizedRow[];
  antecedentVifs: Record<string, Record<string, number>>;
  constructCorrelations: NamedMatrix;
}

function reliabilityOf(model: CfaModel | CbsemModel): NamedMatrix {
  // Columns of factorLoadings are lavaanified; reliability rows keep the
  // declared construct names.
  const byLavName = namedMatrix(
    model.factorLoadings.rows,
    model.factorLoadings.cols,
    model.factorLoadings.values,
  );
  const rel = rhoCAve(
    byLavName,
    model.constructs.map(lavaanifyName),
  );
  return namedMatrix([...model.constructs], rel.cols, rel.values);
}

export function summarizeCfa(model: CfaModel): CfaSummary {
  const { parTable, fit, n, robust } = model.estimation;
  return {
    fit: model.estimation.fitMeasures,
    reliability: reliabilityOf(model),
    loadings: model.factorLoadings,
    solution: standardizedSolutionTable(parTable, fit, n, robust?.vcov),
    estimates: parameterEstimatesTable(parTable, fit, n, robust?.se),
  };
}

/** R^2 row + standardized path coefficients (lavaanified names, as seminr). */
function pathsCoefficientsOf(model: CbsemModel, lavSm: SmMatrix): NamedMatrix {
  const std = model.estimation.std;
  const latents = model.estimation.parTable.latents;
  const antecedents = lavSm.allExogenous();
  const outcomes = lavSm.allEndogenous();
  const values: number[][] = [
    outcomes.map((outcome) => std.r2[outcome] ?? Number.NaN),
    ...antecedents.map((source) =>
      outcomes.map((target) => {
        if (!lavSm.hasPath(source, target)) return Number.NaN;
        return std.beta![latents.indexOf(target)]![latents.indexOf(source)]!;
      }),
    ),
  ];
  return namedMatrix(["R^2", ...antecedents], [...outcomes], values);
}

export function summarizeCbsem(model: CbsemModel): CbsemSummary {
  const { parTable, fit, std, n, robust } = model.estimation;
  const lavSm = model.smMatrix.mapNames(lavaanifyName);
  const solution = standardizedSolutionTable(parTable, fit, n, robust?.vcov);
  return {
    fit: model.estimation.fitMeasures,
    reliability: reliabilityOf(model),
    loadings: model.factorLoadings,
    solution,
    estimates: parameterEstimatesTable(parTable, fit, n, robust?.se),
    pathsCoefficients: pathsCoefficientsOf(model, lavSm),
    paths: solution,
    antecedentVifs: antecedentVifs(
      lavSm,
      namedMatrix([...parTable.latents], [...parTable.latents], std.corLv),
    ),
    constructCorrelations: namedMatrix(
      [...parTable.latents],
      [...parTable.latents],
      std.corLv,
    ),
  };
}

/**
 * Polymorphic summary dispatch by model kind, the TS analog of seminr's S3
 * `summary()` generics (report_summary.R / report_cbsem.R / report_cfa.R).
 */
export function summarize(model: PlsModel): PlsSummary;
export function summarize(model: BootModel): PlsBootSummary;
export function summarize(model: CfaModel): CfaSummary;
export function summarize(model: CbsemModel): CbsemSummary;
export function summarize(
  model: PlsModel | BootModel | CfaModel | CbsemModel,
): PlsSummary | PlsBootSummary | CfaSummary | CbsemSummary {
  if (model.kind === "pls") return summarizePls(model);
  if (model.kind === "boot") return summarizePlsBoot(model);
  return model.kind === "cbsem" ? summarizeCbsem(model) : summarizeCfa(model);
}
