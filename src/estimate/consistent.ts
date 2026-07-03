/**
 * PLSc consistency correction for reflective constructs
 * (feature_consistent.R:48-120; rho_A per Dijkstra & Henseler 2015,
 * evaluate_reliability.R:48-75 + compute_metrics.R:78-94).
 */

import { standardize, colCov, colCor } from "../math/stats.ts";
import { namedMatrix, nmGet, nmSet, type NamedMatrix } from "../math/matrix.ts";
import { solve } from "../math/solve.ts";
import {
  allConstructsOfMode,
  constructItems,
  isModeB,
  isSingleItem,
} from "../model/mmMatrix.ts";
import { allEndogenous, constructAntecedents, isInteraction } from "../model/smMatrix.ts";
import { selectColumns } from "./data.ts";
import { metricsInsample } from "./simplePls.ts";
import type { PlsModel } from "./estimatePls.ts";

function constructWeightVector(model: PlsModel, construct: string): number[] {
  return constructItems(model.mmMatrix, construct).map((item) =>
    nmGet(model.outerWeights, item, construct),
  );
}

/** rho_A reliability per construct: 1 for mode B, single-item, and interaction constructs. */
export function rhoA(model: PlsModel, constructs: readonly string[]): NamedMatrix {
  const rho = namedMatrix(constructs, ["rhoA"]);
  for (const construct of constructs) {
    if (
      isModeB(model.mmMatrix, construct) ||
      isSingleItem(model.mmMatrix, construct) ||
      isInteraction(construct)
    ) {
      nmSet(rho, construct, "rhoA", 1);
      continue;
    }

    const items = constructItems(model.mmMatrix, construct);
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

/** Apply the PLSc adjustment, as seminr's `PLSc()`. Mutates and returns the model. */
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

  const dependant = allEndogenous(model.smMatrix);
  for (const dv of dependant) {
    const exogenous = constructAntecedents(model.smMatrix, dv);
    const subCors = exogenous.map((a) => exogenous.map((b) => nmGet(adjCors, a, b)));
    const rhs = exogenous.map((a) => nmGet(adjCors, a, dv));
    const betas = solve(subCors, rhs);
    exogenous.forEach((iv, k) => nmSet(model.pathCoef, iv, dv, betas[k]!));
  }

  model.rSquared = metricsInsample(model.data.values.length, model.smMatrix, dependant, adjCors);

  const smConstructs = new Set(constructs);
  const reflectives = allConstructsOfMode(model.mmMatrix, "C").filter((c) => smConstructs.has(c));
  for (const construct of reflectives) {
    const items = constructItems(model.mmMatrix, construct);
    const w = constructWeightVector(model, construct);
    const wtw = w.reduce((s2, v) => s2 + v * v, 0);
    const factor = Math.sqrt(rhoOf(construct)) / wtw;
    items.forEach((item, k) => nmSet(model.outerLoadings, item, construct, w[k]! * factor));
  }

  return model;
}

/** Apply PLSc when the model contains reflective ("C") constructs, as seminr's `model_consistent()`. */
export function modelConsistent(model: PlsModel): PlsModel {
  const hasReflective = allConstructsOfMode(model.mmMatrix, "C").length > 0;
  return hasReflective ? plsc(model) : model;
}
