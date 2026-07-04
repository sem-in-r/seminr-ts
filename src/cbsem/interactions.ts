/**
 * CBSEM interaction processing, mirroring seminr's process_cbsem_interactions:
 * product_indicator reuses the shared scaled-product closure; two_stage runs a
 * first-stage CFA and multiplies its ten Berge scores. Generated measurement
 * rows are coerced reflective.
 */

import type { MeasurementModel } from "../specify/constructs.ts";
import { interactionSpecs, nonInteractionSpecs } from "../specify/constructs.ts";
import { MmMatrix } from "../model/mmMatrix.ts";
import type { SmMatrix } from "../model/smMatrix.ts";
import { pathWeighting } from "../estimate/schemes.ts";
import type { Dataset } from "../estimate/data.ts";
import { getColumn } from "../estimate/data.ts";
import { estimateCfa } from "./estimateCfa.ts";

export interface CbsemInteractionOutput {
  data: Dataset;
  mmMatrix: MmMatrix;
}

export function processCbsemInteractions(
  mm: MeasurementModel,
  data: Dataset,
  structuralModel: SmMatrix,
): CbsemInteractionOutput {
  const specs = interactionSpecs(mm);
  const baseMm = MmMatrix.fromMeasurementModel(mm);
  if (specs.length === 0) return { data, mmMatrix: baseMm };

  const columns = [...data.columns];
  const values = data.values.map((row) => [...row]);
  let mmMatrix = baseMm;

  for (const spec of specs) {
    if (spec.methodName === "two_stage") {
      // First stage: CFA of the main-effects measurement model; the
      // interaction column is the product of the ten Berge score columns.
      const mainEffectsMm = nonInteractionSpecs(mm);
      const firstStage = estimateCfa(data, mainEffectsMm);
      const iv = getColumn(firstStage.constructScores, spec.iv);
      const moderator = getColumn(firstStage.constructScores, spec.moderator);
      const name = `${spec.iv}*${spec.moderator}_intxn`;
      columns.push(name);
      values.forEach((row, i) => row.push(iv[i]! * moderator[i]!));
      mmMatrix = mmMatrix.appendRows([{ construct: spec.name, measurement: name, type: "C" }]);
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
      mmMatrix = mmMatrix.appendRows(
        result.mm.map((row) => ({ ...row, type: "C" as const })),
      );
    }
  }

  return { data: { columns, values }, mmMatrix };
}
