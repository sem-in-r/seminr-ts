/**
 * Confirmatory factor analysis, mirroring seminr's estimate_cfa: seminr model
 * syntax resolves to the same mmMatrix the PLS routines use, then a TS ML
 * estimator (lavaan-equivalent under std.lv=TRUE) fits it.
 */

import { constructSpecs, type MeasurementModel } from "../specify/constructs.ts";
import type { ItemAssociations } from "../specify/associations.ts";
import { MmMatrix } from "../model/mmMatrix.ts";
import type { Dataset, ColumnMatrix } from "../estimate/data.ts";
import { selectColumns } from "../estimate/data.ts";
import { namedMatrix, type Matrix, type NamedMatrix } from "../math/matrix.ts";
import { lavaanModelSyntax } from "./lavaanSyntax.ts";
import { buildParTable, type CbsemParTable } from "./partable.ts";
import { sampleCovariance } from "./sigma.ts";
import { fitMl, type MlFitResult, type FitMlOptions } from "./mlFit.ts";
import { standardizedSolution, type StandardizedSolution } from "./standardize.ts";
import { fitMeasures } from "./fitMeasures.ts";
import { tenBergeScores } from "./tenBerge.ts";
import { combineHocLoadings } from "./hoc.ts";

/** Internal estimation details (replaces seminr's opaque lavaan_output). */
export interface CbsemEstimation {
  readonly parTable: CbsemParTable;
  readonly sampleCov: Matrix;
  readonly fit: MlFitResult;
  readonly std: StandardizedSolution;
  readonly n: number;
  readonly fitMeasures: Record<string, number>;
}

export interface CfaModel {
  readonly kind: "cfa";
  /** Estimation data (observed model variables). */
  readonly data: Dataset;
  readonly measurementModel: MeasurementModel;
  readonly mmMatrix: MmMatrix;
  readonly constructs: string[];
  /** Standardized loadings; for HOC models, merged with second-order rows. */
  readonly factorLoadings: NamedMatrix;
  /** Ten Berge factor scores. */
  readonly constructScores: ColumnMatrix;
  /** Ten Berge score weights. */
  readonly itemWeights: NamedMatrix;
  readonly lavaanModel: string;
  readonly estimation: CbsemEstimation;
}

/**
 * Construct names as seminr's construct_names(measurement_model): interaction
 * entries (closures in R) are excluded — the C2/C4 reliability fixtures show
 * seminr's cbsem `constructs` field carries only declared constructs.
 */
export function constructNamesOf(mm: MeasurementModel): string[] {
  return constructSpecs(mm).map((entry) => entry.name);
}

export function hocNamesOf(mm: MeasurementModel): string[] {
  return constructSpecs(mm)
    .filter((e) => e.higherOrder === true)
    .map((e) => e.name);
}

export interface EstimateCbBaseOptions extends FitMlOptions {}

/** Named-argument form of {@link estimateCfa}, mirroring R's argument names. */
export interface EstimateCfaArgs extends EstimateCbBaseOptions {
  data: Dataset;
  measurementModel: MeasurementModel;
  itemAssociations?: ItemAssociations;
}

export function estimateCfa(args: EstimateCfaArgs): CfaModel;
export function estimateCfa(
  data: Dataset,
  measurementModel: MeasurementModel,
  itemAssociations?: ItemAssociations,
  options?: EstimateCbBaseOptions,
): CfaModel;
export function estimateCfa(
  dataOrArgs: Dataset | EstimateCfaArgs,
  maybeMm?: MeasurementModel,
  maybeAssociations?: ItemAssociations,
  maybeOptions: EstimateCbBaseOptions = {},
): CfaModel {
  if ("data" in dataOrArgs && !("columns" in dataOrArgs)) {
    const { data, measurementModel, itemAssociations, ...options } = dataOrArgs;
    return estimateCfaImpl(data, measurementModel, itemAssociations, options);
  }
  return estimateCfaImpl(dataOrArgs as Dataset, maybeMm!, maybeAssociations, maybeOptions);
}

function estimateCfaImpl(
  data: Dataset,
  measurementModel: MeasurementModel,
  itemAssociations?: ItemAssociations,
  options: EstimateCbBaseOptions = {},
): CfaModel {
  const mmMatrix = MmMatrix.fromMeasurementModel(measurementModel);
  const lavaanModel = lavaanModelSyntax({ mmMatrix, itemAssociations });
  const parTable = buildParTable({ mmMatrix, itemAssociations });
  const estData = selectColumns(data, parTable.observed);
  const sampleCov = sampleCovariance(estData);
  const fit = fitMl(parTable, sampleCov, options);
  const std = standardizedSolution(parTable, fit.matrices);
  const n = estData.values.length;

  const hocs = hocNamesOf(measurementModel);
  const factorLoadings =
    hocs.length > 0
      ? combineHocLoadings(parTable, std, hocs)
      : namedMatrix([...parTable.observed], [...parTable.latents], std.lambda);

  const tenBerge = tenBergeScores(parTable, fit.matrices, std, estData);

  return {
    kind: "cfa",
    data: estData,
    measurementModel,
    mmMatrix,
    constructs: constructNamesOf(measurementModel),
    factorLoadings,
    constructScores: tenBerge.scores,
    itemWeights: tenBerge.weights,
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
