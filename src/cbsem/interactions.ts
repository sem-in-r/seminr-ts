/**
 * CBSEM interaction processing, mirroring seminr's process_cbsem_interactions:
 * product_indicator reuses the shared scaled-product closure; two_stage runs a
 * first-stage CFA and multiplies its ten Berge scores. Generated measurement
 * rows are coerced reflective.
 */

import type { MeasurementModel } from "../specify/constructs.ts";
import type { InteractionSpec } from "../specify/interactions.ts";
import type { SMMatrix } from "../specify/relationships.ts";
import type { MMMatrix } from "../model/mmMatrix.ts";
import { buildMmMatrix } from "../model/mmMatrix.ts";
import { pathWeighting } from "../estimate/schemes.ts";
import type { Dataset } from "../estimate/data.ts";
import { getColumn } from "../estimate/data.ts";
import { estimateCfa } from "./estimateCfa.ts";

export interface CbsemInteractionOutput {
  data: Dataset;
  mmMatrix: MMMatrix;
}

export function processCbsemInteractions(
  mm: MeasurementModel,
  data: Dataset,
  structuralModel: SMMatrix,
): CbsemInteractionOutput {
  const specs = mm.filter((e): e is InteractionSpec => e.kind === "interaction");
  const baseMm = buildMmMatrix(mm);
  if (specs.length === 0) return { data, mmMatrix: baseMm };

  const columns = [...data.columns];
  const values = data.values.map((row) => [...row]);
  const mmMatrix: MMMatrix = [...baseMm];

  for (const spec of specs) {
    if (spec.methodName === "two_stage") {
      // First stage: CFA of the main-effects measurement model; the
      // interaction column is the product of the ten Berge score columns.
      const mainEffectsMm = mm.filter((e) => e.kind !== "interaction");
      const firstStage = estimateCfa(data, mainEffectsMm);
      const iv = getColumn(firstStage.constructScores, spec.iv);
      const moderator = getColumn(firstStage.constructScores, spec.moderator);
      const name = `${spec.iv}*${spec.moderator}_intxn`;
      columns.push(name);
      values.forEach((row, i) => row.push(iv[i]! * moderator[i]!));
      mmMatrix.push({ construct: spec.name, measurement: name, type: "C" });
    } else {
      // product_indicator / orthogonal closures only read data + mmMatrix.
      const result = spec.build({
        data,
        mmMatrix: baseMm,
        structuralModel,
        innerWeights: pathWeighting,
      });
      result.data.columns.forEach((col, j) => {
        columns.push(col);
        values.forEach((row, i) => row.push(result.data.values[i]![j]!));
      });
      for (const row of result.mm) {
        mmMatrix.push({ construct: row.construct, measurement: row.measurement, type: "C" });
      }
    }
  }

  return { data: { columns, values }, mmMatrix };
}
