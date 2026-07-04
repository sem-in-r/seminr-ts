/**
 * Full covariance-based SEM estimation, mirroring seminr's estimate_cbsem:
 * process interactions, lavaanify names, generate syntax, fit by ML
 * (std.lv=TRUE semantics), then derive the seminr-shaped results.
 */

import type { MeasurementModel } from "../specify/constructs.ts";
import type { ItemAssociations } from "../specify/associations.ts";
import type { MmMatrix } from "../model/mmMatrix.ts";
import { SmMatrix, type SmMatrixInput } from "../model/smMatrix.ts";
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
import {
  extractModels,
  isSpecifiedModel,
  type SpecifiedModel,
} from "../specify/specifyModel.ts";

export interface CbsemModel {
  readonly kind: "cbsem";
  /** Interaction-augmented estimation data with lavaan-safe column names. */
  readonly data: Dataset;
  readonly rawdata: Dataset;
  readonly measurementModel: MeasurementModel;
  /** mmMatrix incl. generated interaction rows (original `*` names). */
  readonly mmMatrix: MmMatrix;
  readonly smMatrix: SmMatrix;
  readonly associations?: ItemAssociations;
  readonly constructs: string[];
  readonly factorLoadings: NamedMatrix;
  readonly constructScores: ColumnMatrix;
  readonly itemWeights: NamedMatrix;
  /** Standardized path coefficients, antecedents x outcomes (NaN = no path). */
  readonly pathCoef: NamedMatrix;
  readonly lavaanModel: string;
  readonly estimation: CbsemEstimation;
}

/** Named-argument form of {@link estimateCbsem}, mirroring R's argument names. */
export interface EstimateCbsemArgs extends EstimateCbBaseOptions {
  data: Dataset;
  measurementModel: MeasurementModel;
  structuralModel: SmMatrixInput;
  itemAssociations?: ItemAssociations;
}

/** Named-argument form carrying a {@link SpecifiedModel}; components override the bundle. */
export interface EstimateCbsemModelArgs extends EstimateCbBaseOptions {
  data: Dataset;
  model: SpecifiedModel;
  measurementModel?: MeasurementModel;
  structuralModel?: SmMatrixInput;
  itemAssociations?: ItemAssociations;
}

export function estimateCbsem(args: EstimateCbsemArgs | EstimateCbsemModelArgs): CbsemModel;
export function estimateCbsem(
  data: Dataset,
  model: SpecifiedModel,
  options?: EstimateCbBaseOptions,
): CbsemModel;
export function estimateCbsem(
  data: Dataset,
  measurementModel: MeasurementModel,
  structuralModel: SmMatrixInput,
  itemAssociations?: ItemAssociations,
  options?: EstimateCbBaseOptions,
): CbsemModel;
export function estimateCbsem(
  dataOrArgs: Dataset | EstimateCbsemArgs | EstimateCbsemModelArgs,
  mmOrModel?: MeasurementModel | SpecifiedModel,
  smOrOptions?: SmMatrixInput | EstimateCbBaseOptions,
  maybeAssociations?: ItemAssociations,
  maybeOptions: EstimateCbBaseOptions = {},
): CbsemModel {
  if ("data" in dataOrArgs && !("columns" in dataOrArgs)) {
    const { data, measurementModel, structuralModel, itemAssociations, ...options } =
      dataOrArgs as EstimateCbsemArgs & Partial<EstimateCbsemModelArgs>;
    const { model, ...cleanOptions } = options;
    const extracted = extractModels(model, measurementModel, structuralModel, itemAssociations);
    return estimateCbsemImpl(
      data,
      requireComponent(extracted.measurementModel, "measurement"),
      requireComponent(extracted.structuralModel, "structural"),
      extracted.itemAssociations,
      cleanOptions,
    );
  }
  if (isSpecifiedModel(mmOrModel)) {
    const extracted = extractModels(mmOrModel);
    return estimateCbsemImpl(
      dataOrArgs as Dataset,
      requireComponent(extracted.measurementModel, "measurement"),
      requireComponent(extracted.structuralModel, "structural"),
      extracted.itemAssociations,
      (smOrOptions as EstimateCbBaseOptions | undefined) ?? {},
    );
  }
  return estimateCbsemImpl(
    dataOrArgs as Dataset,
    mmOrModel as MeasurementModel,
    smOrOptions as SmMatrixInput,
    maybeAssociations,
    maybeOptions,
  );
}

function requireComponent<T>(component: T | undefined, name: string): T {
  if (component === undefined) {
    throw new Error(`A ${name} model is required (directly or via a specified model).`);
  }
  return component;
}

function estimateCbsemImpl(
  data: Dataset,
  measurementModel: MeasurementModel,
  structuralModelInput: SmMatrixInput,
  itemAssociations?: ItemAssociations,
  options: EstimateCbBaseOptions = {},
): CbsemModel {
  const rawdata = data;
  const structuralModel = SmMatrix.from(structuralModelInput);

  // Interactions: augment data, coerce generated rows reflective.
  const processed = processCbsemInteractions(measurementModel, data, structuralModel);

  // lavaan-safe names for data columns, mm rows, and sm entries.
  const lavData: Dataset = {
    columns: processed.data.columns.map(lavaanifyName),
    values: processed.data.values,
  };
  const lavMm = processed.mmMatrix.mapNames(lavaanifyName);
  const lavSm = structuralModel.mapNames(lavaanifyName);

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
    .filter((name) => lavSm.constructNames().includes(name));
  const factorLoadings =
    hocs.length > 0
      ? combineHocLoadings(parTable, std, hocs)
      : namedMatrix([...parTable.observed], [...parTable.latents], std.lambda);

  const tenBerge = tenBergeScores(parTable, fit.matrices, std, estData);
  const pathCoef = pathCoefMatrix(parTable, std, lavSm);

  return {
    kind: "cbsem",
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
