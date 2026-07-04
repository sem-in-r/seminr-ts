/**
 * PLSpredict prediction schemes (feature_plspredict.R:885-918): Direct
 * Antecedents (default) predicts each construct from its direct antecedent
 * scores; Earliest Antecedents propagates scores from the purely exogenous
 * constructs through the structural model in dependency order.
 */

import { matmul, namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import type { SmMatrix } from "../model/smMatrix.ts";

/**
 * A prediction scheme: maps measured construct scores to predicted scores.
 * `pathCoef` rows/cols and `scores` cols share the model's construct order.
 */
export type PredictTechnique = (
  sm: SmMatrix,
  pathCoef: NamedMatrix,
  scores: NamedMatrix,
) => NamedMatrix;

/**
 * Dependency order in which endogenous constructs can be predicted from
 * already-predicted antecedents, as seminr's `construct_order()`. Any valid
 * topological order yields identical EA predictions.
 */
export function constructOrder(sm: SmMatrix): string[] {
  const onlyExo = sm.onlyExogenous();
  const onlyEndo = new Set(sm.onlyEndogenous());
  const pending = new Set(
    sm.constructNames().filter((c) => !onlyEndo.has(c) && !onlyExo.includes(c)),
  );
  const satisfied = new Set(onlyExo);
  const order: string[] = [];
  while (pending.size > 0) {
    let progressed = false;
    for (const c of [...pending]) {
      if (sm.constructAntecedents(c).every((a) => satisfied.has(a))) {
        order.push(c);
        satisfied.add(c);
        pending.delete(c);
        progressed = true;
      }
    }
    if (!progressed) throw new Error("Structural model contains a cycle");
  }
  return [...order, ...sm.onlyEndogenous()];
}

/** Direct Antecedents: scores x pathCoef; purely exogenous constructs keep their scores. */
export const predictDA: PredictTechnique = (sm, pathCoef, scores) => {
  const out = namedMatrix(scores.rows, scores.cols, matmul(scores.values, pathCoef.values));
  for (const construct of sm.onlyExogenous()) {
    const j = scores.cols.indexOf(construct);
    for (let r = 0; r < scores.values.length; r++) out.values[r]![j] = scores.values[r]![j]!;
  }
  return out;
};

/** Earliest Antecedents: propagate from purely exogenous scores through the model. */
export const predictEA: PredictTechnique = (sm, pathCoef, scores) => {
  const out = namedMatrix(
    scores.rows,
    scores.cols,
    scores.values.map((row) => [...row]),
  );
  const order = constructOrder(sm);
  for (const construct of order) {
    const j = scores.cols.indexOf(construct);
    for (const row of out.values) row[j] = 0;
  }
  for (const construct of order) {
    const j = scores.cols.indexOf(construct);
    for (const row of out.values) {
      let value = 0;
      for (let p = 0; p < scores.cols.length; p++) value += row[p]! * pathCoef.values[p]![j]!;
      row[j] = value;
    }
  }
  return out;
};
