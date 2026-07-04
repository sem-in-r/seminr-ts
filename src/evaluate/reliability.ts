/**
 * PLS reliability metrics: Cronbach's alpha (evaluate_reliability.R:194-213)
 * and the alpha | rhoA | rhoC | AVE table (evaluate_measurement_model.R:12-23).
 * rhoC/AVE reuse the shared loading-based formula (evaluate_reliability.R:98-119)
 * and rhoA comes from the PLSc machinery.
 */

import { colCor } from "../math/stats.ts";
import { namedMatrix, nmGet, nmSet, type NamedMatrix } from "../math/matrix.ts";
import { selectColumns } from "../estimate/data.ts";
import { rhoA } from "../estimate/consistent.ts";
import { rhoCAve } from "../cbsem/summary.ts";
import type { PlsModel } from "../estimate/estimatePls.ts";
import { constructsInModel } from "./constructsInModel.ts";

/** Cronbach's alpha per construct over the estimation data; single-item constructs get 1. */
export function cronbachsAlpha(model: PlsModel, constructs: readonly string[]): NamedMatrix {
  const out = namedMatrix(constructs, ["alpha"]);
  for (const construct of constructs) {
    const items = model.mmMatrix.constructItems(construct);
    if (items.length <= 1) {
      nmSet(out, construct, "alpha", 1);
      continue;
    }
    const itemValues = selectColumns(model.data, items).values;
    const r = colCor(itemValues, itemValues);
    const k = items.length;
    let total = 0;
    let diag = 0;
    for (let i = 0; i < k; i++) {
      diag += r[i]![i]!;
      for (let j = 0; j < k; j++) total += r[i]![j]!;
    }
    nmSet(out, construct, "alpha", (k / (k - 1)) * (1 - diag / total));
  }
  return out;
}

/** Reliability table: constructs x (alpha | rhoA | rhoC | AVE). */
export function reliabilityTable(model: PlsModel): NamedMatrix {
  const { names } = constructsInModel(model);
  const alpha = cronbachsAlpha(model, names);
  const rho = rhoA(model, names);
  const rca = rhoCAve(model.outerLoadings, names);
  const values = names.map((c) => [
    nmGet(alpha, c, "alpha"),
    nmGet(rho, c, "rhoA"),
    nmGet(rca, c, "rhoC"),
    nmGet(rca, c, "AVE"),
  ]);
  return namedMatrix(names, ["alpha", "rhoA", "rhoC", "AVE"], values);
}
