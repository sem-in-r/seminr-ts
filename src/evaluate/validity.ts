/**
 * PLS validity metrics: HTMT (evaluate_validity.R:41-74), Fornell-Larcker
 * criteria (evaluate_validity.R:78-84), cross-loadings
 * (evaluate_measurement_model.R:38-46), item VIFs (evaluate_validity.R:5-21),
 * and antecedent VIFs (evaluate_validity.R:24-36).
 */

import { colCor, centerColumns, corFromCentered } from "../math/stats.ts";
import { namedMatrix, nmGet, type NamedMatrix } from "../math/matrix.ts";
import { inverse } from "../math/solve.ts";
import { selectColumns } from "../estimate/data.ts";
import { constructSpecs } from "../specify/constructs.ts";
import { antecedentVifs, rhoCAve } from "../cbsem/summary.ts";
import type { PlsModel } from "../estimate/estimatePls.ts";
import { constructsInModel, type ConstructsInModel } from "./constructsInModel.ts";

function nanMatrix(rows: readonly string[], cols: readonly string[]): NamedMatrix {
  return namedMatrix(
    rows,
    cols,
    rows.map(() => cols.map(() => Number.NaN)),
  );
}

/**
 * Heterotrait-monotrait ratio of correlations over construct pairs; upper
 * triangle only (other cells NaN). Single-item monotrait blocks count as 1.
 */
export function htmt(model: PlsModel): NamedMatrix {
  const { names } = constructsInModel(model);
  const out = nanMatrix(names, names);

  // each construct's item block is selected and centered exactly once; the
  // per-pair correlations below reuse these stats (seminr 6331445 discipline)
  const blocks = names.map((construct) => {
    const items = model.mmMatrix.constructItems(construct);
    return { items, stats: centerColumns(selectColumns(model.data, items).values) };
  });

  // mean off-diagonal absolute within-block correlation, 1 for single items
  const monotrait = blocks.map(({ items, stats }) => {
    if (items.length <= 1) return 1;
    const r = corFromCentered(stats, stats);
    let sum = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) sum += Math.abs(r[i]![j]!);
    }
    return (2 / (items.length * (items.length - 1))) * sum;
  });

  for (let i = 0; i < names.length - 1; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const r = corFromCentered(blocks[i]!.stats, blocks[j]!.stats);
      let sum = 0;
      for (const row of r) for (const v of row) sum += Math.abs(v);
      const heterotrait = sum / (r.length * r[0]!.length);
      out.values[i]![j] = heterotrait / Math.sqrt(monotrait[i]! * monotrait[j]!);
    }
  }
  return out;
}

/**
 * Fornell-Larcker criteria table: construct-score correlations on the lower
 * triangle, sqrt(AVE) on the diagonal, NaN above.
 */
export function flCriteriaTable(model: PlsModel, mc: ConstructsInModel): NamedMatrix {
  const cols = mc.scores.cols;
  const r = colCor(mc.scores.values, mc.scores.values);
  const ave = rhoCAve(model.outerLoadings, cols);
  const values = cols.map((rowName, i) =>
    cols.map((_, j) => {
      if (i === j) return Math.sqrt(nmGet(ave, rowName, "AVE"));
      return i > j ? r[i]![j]! : Number.NaN;
    }),
  );
  return namedMatrix(cols, cols, values);
}

/** Correlations of every measured item with every construct score. */
export function crossLoadings(model: PlsModel, mc: ConstructsInModel): NamedMatrix {
  const items = model.hoc
    ? [...new Set(constructSpecs(model.measurementModel).flatMap((s) => s.items))]
    : model.mmVariables;
  const itemValues = selectColumns(model.data, items).values;
  return namedMatrix(items, mc.scores.cols, colCor(itemValues, mc.scores.values));
}

/**
 * VIF of each item on the other items of its construct (diagonal of the
 * inverse item-correlation matrix); single-item constructs get 1.
 */
export function itemVifs(
  model: PlsModel,
  mc: ConstructsInModel,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const construct of mc.names) {
    const items = model.mmMatrix.constructItems(construct);
    const byItem: Record<string, number> = {};
    if (items.length === 1) {
      byItem[items[0]!] = 1;
    } else {
      const values = selectColumns(model.data, items).values;
      const inv = inverse(colCor(values, values));
      items.forEach((item, i) => {
        byItem[item] = inv[i]![i]!;
      });
    }
    out[construct] = byItem;
  }
  return out;
}

/**
 * VIF of each antecedent per endogenous construct from the construct-score
 * correlations; single-antecedent outcomes get NaN (seminr's NA).
 */
export function plsAntecedentVifs(
  model: PlsModel,
  mc: ConstructsInModel,
): Record<string, Record<string, number>> {
  const cor = namedMatrix(mc.scores.cols, mc.scores.cols, colCor(mc.scores.values, mc.scores.values));
  return antecedentVifs(model.smMatrix, cor);
}
