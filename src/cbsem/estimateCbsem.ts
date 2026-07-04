/**
 * Full covariance-based SEM estimation, mirroring seminr's estimate_cbsem:
 * process interactions, lavaanify names, generate syntax, fit by ML
 * (std.lv=TRUE semantics), then derive the seminr-shaped results.
 */

import type { MeasurementModel } from "../specify/constructs.ts";
import type { ItemAssociations } from "../specify/associations.ts";
import type { SMMatrix } from "../specify/relationships.ts";
import type { MMMatrix } from "../model/mmMatrix.ts";
import type { Dataset, ColumnMatrix } from "../estimate/data.ts";
import { selectColumns } from "../estimate/data.ts";
import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import { lavaanModelSyntax, lavaanifyName } from "./lavaanSyntax.ts";
import { buildParTable } from "./partable.ts";
import { sampleCovariance } from "./sigma.ts";
import { fitMl } from "./mlFit.ts";
import { standardizedSolution, pathCoefMatrix } from "./standardize.ts";
import { fitMeasures } from "./fitMeasures.ts";
import { tenBergeScores } from "./tenBerge.ts";
import { combineHocLoadings } from "./hoc.ts";
import { processCbsemInteractions } from "./interactions.ts";
import {
  constructNamesOf,
  hocNamesOf,
  type CbsemEstimation,
  type EstimateCbBaseOptions,
} from "./estimateCfa.ts";
import { constructNames } from "../model/smMatrix.ts";

export interface CbsemModel {
  /** Interaction-augmented estimation data with lavaan-safe column names. */
  data: Dataset;
  rawdata: Dataset;
  measurementModel: MeasurementModel;
  /** mmMatrix incl. generated interaction rows (original `*` names). */
  mmMatrix: MMMatrix;
  smMatrix: SMMatrix;
  associations?: ItemAssociations;
  constructs: string[];
  factorLoadings: NamedMatrix;
  constructScores: ColumnMatrix;
  itemWeights: NamedMatrix;
  /** Standardized path coefficients, antecedents x outcomes (NaN = no path). */
  pathCoef: NamedMatrix;
  lavaanModel: string;
  estimation: CbsemEstimation;
}

/** Named-argument form of {@link estimateCbsem}, mirroring R's argument names. */
export interface EstimateCbsemArgs extends EstimateCbBaseOptions {
  data: Dataset;
  measurementModel: MeasurementModel;
  structuralModel: SMMatrix;
  itemAssociations?: ItemAssociations;
}

export function estimateCbsem(args: EstimateCbsemArgs): CbsemModel;
export function estimateCbsem(
  data: Dataset,
  measurementModel: MeasurementModel,
  structuralModel: SMMatrix,
  itemAssociations?: ItemAssociations,
  options?: EstimateCbBaseOptions,
): CbsemModel;
export function estimateCbsem(
  dataOrArgs: Dataset | EstimateCbsemArgs,
  maybeMm?: MeasurementModel,
  maybeSm?: SMMatrix,
  maybeAssociations?: ItemAssociations,
  maybeOptions: EstimateCbBaseOptions = {},
): CbsemModel {
  if ("data" in dataOrArgs && !("columns" in dataOrArgs)) {
    const { data, measurementModel, structuralModel, itemAssociations, ...options } = dataOrArgs;
    return estimateCbsemImpl(data, measurementModel, structuralModel, itemAssociations, options);
  }
  return estimateCbsemImpl(
    dataOrArgs as Dataset,
    maybeMm!,
    maybeSm!,
    maybeAssociations,
    maybeOptions,
  );
}

function estimateCbsemImpl(
  data: Dataset,
  measurementModel: MeasurementModel,
  structuralModel: SMMatrix,
  itemAssociations?: ItemAssociations,
  options: EstimateCbBaseOptions = {},
): CbsemModel {
  const rawdata = data;

  // Interactions: augment data, coerce generated rows reflective.
  const processed = processCbsemInteractions(measurementModel, data, structuralModel);

  // lavaan-safe names for data columns, mm rows, and sm entries.
  const lavData: Dataset = {
    columns: processed.data.columns.map(lavaanifyName),
    values: processed.data.values,
  };
  const lavMm: MMMatrix = processed.mmMatrix.map((row) => ({
    construct: lavaanifyName(row.construct),
    measurement: lavaanifyName(row.measurement),
    type: row.type,
  }));
  const lavSm: SMMatrix = structuralModel.map((row) => ({
    source: lavaanifyName(row.source),
    target: lavaanifyName(row.target),
  }));

  const lavaanModel = lavaanModelSyntax({
    mmMatrix: lavMm,
    structuralModel: lavSm,
    itemAssociations,
  });
  const parTable = buildParTable({
    mmMatrix: lavMm,
    structuralModel: lavSm,
    itemAssociations,
  });
  const estData = selectColumns(lavData, parTable.observed);
  const sampleCov = sampleCovariance(estData);
  const fit = fitMl(parTable, sampleCov, options);
  const std = standardizedSolution(parTable, fit.matrices);
  const n = estData.values.length;

  const hocs = hocNamesOf(measurementModel)
    .map(lavaanifyName)
    .filter((name) => constructNames(lavSm).includes(name));
  const factorLoadings =
    hocs.length > 0
      ? combineHocLoadings(parTable, std, hocs)
      : namedMatrix([...parTable.observed], [...parTable.latents], std.lambda);

  const tenBerge = tenBergeScores(parTable, fit.matrices, std, estData);
  const pathCoef = pathCoefMatrix(parTable, std, lavSm);

  return {
    data: lavData,
    rawdata,
    measurementModel,
    mmMatrix: processed.mmMatrix,
    smMatrix: structuralModel,
    associations: itemAssociations,
    constructs: constructNamesOf(measurementModel),
    factorLoadings,
    constructScores: tenBerge.scores,
    itemWeights: tenBerge.weights,
    pathCoef,
    lavaanModel,
    estimation: {
      parTable,
      sampleCov,
      fit,
      std,
      n,
      fitMeasures: fitMeasures(parTable, sampleCov, fit, n),
    },
  };
}
