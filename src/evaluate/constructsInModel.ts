/**
 * Bundle of construct names and scores used by the evaluation suite, as
 * seminr's `constructs_in_model()` (helpers-model.R:82-99). For higher-order
 * models the names are the union of the second- and first-stage structural
 * models, and the scores gain the first-stage-only construct columns.
 */

import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import type { PlsModel } from "../estimate/estimatePls.ts";

export interface ConstructsInModel {
  names: string[];
  /** Construct scores, columns ordered as seminr's `construct_scores()`. */
  scores: NamedMatrix;
}

export function constructsInModel(model: PlsModel): ConstructsInModel {
  const mmConstructs = new Set(model.mmMatrix.allConstructs());
  const modelScores = model.constructScores;

  if (!model.hoc || !model.firstStageModel) {
    const names = model.smMatrix.constructNames().filter((c) => mmConstructs.has(c));
    return { names, scores: modelScores };
  }

  const firstStage = model.firstStageModel;
  const smNames = model.smMatrix.constructNames();
  const firstStageNames = firstStage.smMatrix.constructNames();
  const union = [...new Set([...smNames, ...firstStageNames])];
  const names = union.filter((c) => mmConstructs.has(c));

  const smNameSet = new Set(smNames);
  const firstStageOnly = firstStageNames.filter((c) => !smNameSet.has(c));
  const cols = [...modelScores.cols, ...firstStageOnly];
  const fsCols = firstStageOnly.map((c) => firstStage.constructScores.cols.indexOf(c));
  const values = modelScores.values.map((row, r) => [
    ...row,
    ...fsCols.map((j) => firstStage.constructScores.values[r]![j]!),
  ]);
  return { names, scores: namedMatrix(modelScores.rows, cols, values) };
}
