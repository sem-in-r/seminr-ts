/**
 * PLS effect-size and structural reporting: f-squared (evaluate_effects.R),
 * paths report with R^2 rows (report_paths_and_intervals.R:53-74), total
 * indirect effects (library.R:202-204), and AIC/BIC information criteria
 * (compute_metrics.R:48-75).
 */

import { colCor, sd } from "../math/stats.ts";
import { namedMatrix, nmGet, nmSet, type NamedMatrix } from "../math/matrix.ts";
import { solve } from "../math/solve.ts";
import { isInteraction } from "../model/smMatrix.ts";
import { estimatePls, type PlsModel } from "../estimate/estimatePls.ts";
import { totalEffects } from "../bootstrap/bootstrap.ts";

/** Total effects minus direct effects. */
export function totalIndirectEffects(pathCoef: NamedMatrix): NamedMatrix {
  const total = totalEffects(pathCoef);
  const values = total.values.map((row, i) =>
    row.map((v, j) => v - pathCoef.values[i]![j]!),
  );
  return namedMatrix(pathCoef.rows, pathCoef.cols, values);
}

/**
 * Cohen's f-squared for one iv -> dv path: re-estimate the model without the
 * path (same data and settings) and compare R-squared.
 */
export function fSquared(model: PlsModel, iv: string, dv: string): number {
  if (model.constructs.length === 2) {
    const rsq = nmGet(model.rSquared, "Rsq", dv);
    return rsq / (1 - rsq);
  }
  const withoutSm = model.smMatrix.removePath(iv, dv);
  const withR2 = nmGet(model.rSquared, "Rsq", dv);
  let withoutR2 = 0;
  if (withoutSm.constructAntecedents(dv).length > 0) {
    const withoutModel = estimatePls(model.rawdata, model.measurementModel, withoutSm, {
      innerWeights: model.innerWeights,
      missing: model.missing,
      missingValue: model.settings.missingValue,
      maxIt: model.settings.maxIt,
      stopCriterion: model.settings.stopCriterion,
    });
    withoutR2 = nmGet(withoutModel.rSquared, "Rsq", dv);
  }
  return (withR2 - withoutR2) / (1 - withR2);
}

/**
 * f-squared for every exogenous x endogenous pair, in a path_coef-shaped
 * matrix. Components of an interaction targeting a dv get NaN for that dv
 * (omitting them would make estimation fail).
 */
export function modelFsquares(model: PlsModel): NamedMatrix {
  const sm = model.smMatrix;
  const out = namedMatrix(
    model.pathCoef.rows,
    model.pathCoef.cols,
    model.pathCoef.values.map((r) => [...r]),
  );
  for (const dv of sm.allEndogenous()) {
    const interactions = sm.constructAntecedents(dv).filter(isInteraction);
    const intComponents = new Set(interactions.flatMap((name) => name.split("*")));
    for (const iv of sm.allExogenous()) {
      if (intComponents.has(iv)) continue;
      nmSet(out, iv, dv, fSquared(model, iv, dv));
    }
    for (const component of intComponents) nmSet(out, component, dv, Number.NaN);
  }
  return out;
}

/** Paths report: R^2 and AdjR^2 rows above the nonzero path coefficients (NaN elsewhere). */
export function reportPaths(model: PlsModel): NamedMatrix {
  const sm = model.smMatrix;
  const endogenous = sm.allEndogenous();
  const exogenous = sm.allExogenous();
  const rows = ["R^2", "AdjR^2", ...exogenous];
  const out = namedMatrix(
    rows,
    endogenous,
    rows.map(() => endogenous.map(() => Number.NaN)),
  );
  for (const dv of endogenous) {
    nmSet(out, "R^2", dv, nmGet(model.rSquared, "Rsq", dv));
    nmSet(out, "AdjR^2", dv, nmGet(model.rSquared, "AdjRsq", dv));
    for (const iv of exogenous) {
      const coef = nmGet(model.pathCoef, iv, dv);
      if (coef !== 0) nmSet(out, iv, dv, coef);
    }
  }
  return out;
}

/** R-squared of a dv from a correlation matrix: d' inv(R_iv) d. */
function corRsq(cor: NamedMatrix, dv: string, ivs: readonly string[]): number {
  const sub = ivs.map((a) => ivs.map((b) => nmGet(cor, a, b)));
  const d = ivs.map((a) => nmGet(cor, a, dv));
  const beta = solve(sub, d);
  return d.reduce((s, v, i) => s + v * beta[i]!, 0);
}

/** AIC and BIC per endogenous construct from construct-score regressions. */
export function itCriteria(model: PlsModel): NamedMatrix {
  const scores = model.constructScores;
  const cor = namedMatrix(scores.cols, scores.cols, colCor(scores.values, scores.values));
  const n = scores.values.length;
  const endogenous = model.smMatrix.allEndogenous();
  const out = namedMatrix(["AIC", "BIC"], endogenous);
  for (const dv of endogenous) {
    const antecedents = model.smMatrix.constructAntecedents(dv);
    const pk = antecedents.length;
    const rsq = corRsq(cor, dv, antecedents);
    const column = scores.values.map((row) => row[scores.cols.indexOf(dv)]!);
    const variance = sd(column) ** 2;
    const logMse = n * Math.log(((1 - rsq) * variance * (n - 1)) / n);
    nmSet(out, "AIC", dv, 2 * (pk + 1) + logMse);
    nmSet(out, "BIC", dv, logMse + (pk + 1) * Math.log(n));
  }
  return out;
}
