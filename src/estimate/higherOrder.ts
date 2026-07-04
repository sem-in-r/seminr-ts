/** Two-stage higher-order constructs (feature_higher_order.R:7-149). */

import { constructSpecs, type ConstructSpec, type MeasurementModel } from "../specify/constructs.ts";
import { paths } from "../specify/relationships.ts";
import { MmMatrix } from "../model/mmMatrix.ts";
import type { SmMatrix } from "../model/smMatrix.ts";
import { namedMatrix, nmGet, nmSet, type NamedMatrix } from "../math/matrix.ts";
import type { Dataset } from "./data.ts";
import type { InnerWeightsFn } from "./schemes.ts";
import type { SimplePlsModel } from "./simplePls.ts";
// Circular at module level with estimatePls.ts, but only called at runtime —
// safe under ESM live bindings (estimatePls is a hoisted function declaration).
import { estimatePls, type PlsModel } from "./estimatePls.ts";

/** Construct specs that define a higher-order composite. */
export function hocSpecs(measurementModel: MeasurementModel, structuralModel?: SmMatrix): ConstructSpec[] {
  const smNames = structuralModel ? new Set(structuralModel.constructNames()) : undefined;
  return constructSpecs(measurementModel).filter(
    (e) => e.method === "two_stage" && (!smNames || smNames.has(e.name)),
  );
}

export interface ExpandedHoc {
  sm: SmMatrix;
  dimensions: string[];
}

/** Replace paths into/out of a HOC with paths into/out of each of its dimensions. */
export function expandHocToLocs(hoc: ConstructSpec, sm: SmMatrix): ExpandedHoc {
  const dimensions = [...hoc.items];
  let rewired = sm;

  const antecedents = rewired.constructAntecedents(hoc.name);
  if (antecedents.length > 0) {
    rewired = rewired.appendPaths(paths(antecedents, dimensions)).removePathsTo([hoc.name]);
  }

  const outcomes = rewired.constructTargets(hoc.name);
  if (outcomes.length > 0) {
    rewired = rewired.appendPaths(paths(dimensions, outcomes)).removePathsFrom([hoc.name]);
  }

  return { sm: rewired, dimensions };
}

export interface HigherOrderPreparation {
  data: Dataset;
  firstStageModel: PlsModel;
}

/**
 * First stage of the two-stage HOC method: estimate the model with HOCs
 * expanded to their dimensions, then append the dimension scores to the data
 * as observable columns for stage two.
 */
export function prepareHigherOrderModel(
  data: Dataset,
  measurementModel: MeasurementModel,
  structuralModel: SmMatrix,
  innerWeights: InnerWeightsFn,
  maxIt: number,
  stopCriterion: number,
): HigherOrderPreparation {
  const firstStageMm = constructSpecs(measurementModel).filter((e) => e.method !== "two_stage");
  const firstStageMmMatrix = MmMatrix.fromMeasurementModel(firstStageMm);

  let sm = structuralModel;
  const smNames = new Set(structuralModel.constructNames());
  const dimensions: string[] = [];
  for (const hoc of hocSpecs(measurementModel)) {
    if (!smNames.has(hoc.name)) continue;
    const expanded = expandHocToLocs(hoc, sm);
    sm = expanded.sm;
    dimensions.push(...expanded.dimensions);
  }

  // drop paths from constructs absent from the first-stage measurement model (removes interactions)
  sm = sm.keepPathsFrom(firstStageMmMatrix.allConstructs());

  const firstStageModel = estimatePls(data, firstStageMm, sm, {
    innerWeights,
    maxIt,
    stopCriterion,
  });

  const scoreCols = dimensions.map((d) => firstStageModel.constructScores.cols.indexOf(d));
  const augmented: Dataset = {
    columns: [...data.columns, ...dimensions],
    values: data.values.map((row, r) => [
      ...row,
      ...scoreCols.map((j) => firstStageModel.constructScores.values[r]![j]!),
    ]),
  };

  return { data: augmented, firstStageModel };
}

export interface CombinedMatrices {
  outerWeights: NamedMatrix;
  outerLoadings: NamedMatrix;
}

/** Merge stage-1 and stage-2 loadings/weights into full item+construct matrices. */
export function combineFirstOrderSecondOrderMatrices(
  stage1: SimplePlsModel,
  stage2: SimplePlsModel,
  mmMatrix: MmMatrix,
): CombinedMatrices {
  const appendedVars = [...new Set([...stage2.mmVariables, ...stage1.mmVariables])];
  const appendedConstructs = [...new Set([...stage2.constructs, ...stage1.constructs])];
  const stage2Vars = new Set(stage2.mmVariables);
  const stage2Constructs = new Set(stage2.constructs);
  const hocItems = stage1.mmVariables.filter((v) => !stage2Vars.has(v));
  const hocConstructs = stage1.constructs.filter((c) => !stage2Constructs.has(c));

  const membership = namedMatrix(appendedVars, appendedConstructs);
  for (const construct of appendedConstructs) {
    for (const item of mmMatrix.constructItems(construct)) nmSet(membership, item, construct, 1);
  }

  const combine = (stage1Matrix: NamedMatrix, stage2Matrix: NamedMatrix): NamedMatrix => {
    const out = namedMatrix(appendedVars, appendedConstructs, membership.values.map((r) => [...r]));
    for (const row of stage2Matrix.rows) {
      for (const col of stage2Matrix.cols) nmSet(out, row, col, nmGet(stage2Matrix, row, col));
    }
    for (const row of hocItems) {
      for (const col of hocConstructs) nmSet(out, row, col, nmGet(stage1Matrix, row, col));
    }
    return out;
  };

  return {
    outerWeights: combine(stage1.outerWeights, stage2.outerWeights),
    outerLoadings: combine(stage1.outerLoadings, stage2.outerLoadings),
  };
}
