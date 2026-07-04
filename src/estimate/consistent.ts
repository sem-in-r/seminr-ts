/**
 * PLSc consistency correction for reflective constructs
 * (feature_consistent.R:48-120; rho_A per Dijkstra & Henseler 2015,
 * evaluate_reliability.R:48-75 + compute_metrics.R:78-94).
 */

import { standardize, colCov, colCor } from "../math/stats.ts";
import { namedMatrix, nmGet, nmSet, type NamedMatrix } from "../math/matrix.ts";
import { solve } from "../math/solve.ts";
import { isInteraction } from "../model/smMatrix.ts";
import { selectColumns } from "./data.ts";
import { metricsInsample } from "./simplePls.ts";
import type { PlsModel } from "./estimatePls.ts";

function constructWeightVector(model: PlsModel, construct: string): number[] {
  return model.mmMatrix.constructItems(construct).map((item) =>
    nmGet(model.outerWeights, item, construct),
  );
}

/** rho_A reliability per construct: 1 for mode B, single-item, and interaction constructs. */
export function rhoA(model: PlsModel, constructs: readonly string[]): NamedMatrix {
  const rho = namedMatrix(constructs, ["rhoA"]);
  for (const construct of constructs) {
    if (
      model.mmMatrix.isModeB(construct) ||
      model.mmMatrix.isSingleItem(construct) ||
      isInteraction(construct)
    ) {
      nmSet(rho, construct, "rhoA", 1);
      continue;
    }

    const items = model.mmMatrix.constructItems(construct);
    const w = constructWeightVector(model, construct);
    const indicators = standardize(selectColumns(model.data, items).values, items).values;
    const s = colCov(indicators, indicators);

    // quadratic forms with zeroed diagonals
    let wtw = 0;
    let wSw = 0;
    let wAAw = 0;
    for (let i = 0; i < w.length; i++) {
      wtw += w[i]! * w[i]!;
      for (let j = 0; j < w.length; j++) {
        if (i === j) continue;
        wSw += w[i]! * s[i]![j]! * w[j]!;
        wAAw += w[i]! * (w[i]! * w[j]!) * w[j]!;
      }
    }
    nmSet(rho, construct, "rhoA", wtw * wtw * (wSw / wAAw));
  }
  return rho;
}

/** Apply the PLSc adjustment, as seminr's `PLSc()`. Returns an adjusted copy of the model. */
export function plsc(model: PlsModel): PlsModel {
  const constructs = model.constructs;
  const rho = rhoA(model, constructs);
  const rhoOf = (c: string): number => (isInteraction(c) ? 1 : nmGet(rho, c, "rhoA"));

  const scoreCors = colCor(model.constructScores.values, model.constructScores.values);
  const adjCors = namedMatrix(constructs, constructs);
  constructs.forEach((ci, i) => {
    constructs.forEach((cj, j) => {
      const adjustment = i === j ? 1 : Math.sqrt(rhoOf(ci) * rhoOf(cj));
      adjCors.values[i]![j] = scoreCors[i]![j]! / adjustment;
    });
  });

  const dependant = model.smMatrix.allEndogenous();
  for (const dv of dependant) {
    const exogenous = model.smMatrix.constructAntecedents(dv);
    const subCors = exogenous.map((a) => exogenous.map((b) => nmGet(adjCors, a, b)));
    const rhs = exogenous.map((a) => nmGet(adjCors, a, dv));
    const betas = solve(subCors, rhs);
    exogenous.forEach((iv, k) => nmSet(model.pathCoef, iv, dv, betas[k]!));
  }

  const rSquared = metricsInsample(model.data.values.length, model.smMatrix, dependant, adjCors);

  const smConstructs = new Set(constructs);
  const reflectives = model.mmMatrix.allConstructsOfMode("C").filter((c) => smConstructs.has(c));
  for (const construct of reflectives) {
    const items = model.mmMatrix.constructItems(construct);
    const w = constructWeightVector(model, construct);
    const wtw = w.reduce((s2, v) => s2 + v * v, 0);
    const factor = Math.sqrt(rhoOf(construct)) / wtw;
    items.forEach((item, k) => nmSet(model.outerLoadings, item, construct, w[k]! * factor));
  }

  return { ...model, rSquared };
}

/** Apply PLSc when the model contains reflective ("C") constructs, as seminr's `model_consistent()`. */
export function modelConsistent(model: PlsModel): PlsModel {
  const hasReflective = model.mmMatrix.allConstructsOfMode("C").length > 0;
  return hasReflective ? plsc(model) : model;
}
