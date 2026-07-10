/**
 * `dotGraph()` — convert seminr models to Graphviz DOT (plot_dot.R:245-658).
 *
 * R dispatches via S3 on model class; this port dispatches on the model's
 * `kind` discriminant (or array shape for raw specs) inside one function with
 * the same parameters.
 */

import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import { MmMatrix } from "../model/mmMatrix.ts";
import { SmMatrix } from "../model/smMatrix.ts";
import type { SMRow } from "../specify/relationships.ts";
import type { MeasurementModel } from "../specify/constructs.ts";
import { reflective } from "../specify/constructs.ts";
import type { SpecifiedModel } from "../specify/specifyModel.ts";
import type { PlsModel } from "../estimate/estimatePls.ts";
import type { BootModel } from "../bootstrap/bootstrap.ts";
import type { CbsemModel } from "../cbsem/estimateCbsem.ts";
import type { CfaModel } from "../cbsem/estimateCfa.ts";
import * as engine from "./dotEngine.ts";
import { rNum, rRound } from "./rFormat.ts";
import { seminrThemeGet, type SeminrTheme } from "./theme.ts";

/** Anything `dotGraph`/`plot` can draw. */
export type PlottableModel =
  | PlsModel
  | BootModel
  | CbsemModel
  | CfaModel
  | SpecifiedModel
  | MeasurementModel
  | SmMatrix
  | readonly Readonly<SMRow>[];

export interface DotGraphOptions {
  title?: string;
  theme?: SeminrTheme;
  measurementOnly?: boolean;
  structureOnly?: boolean;
  alpha?: number;
}

function ones(rows: readonly string[], cols: readonly string[]): NamedMatrix {
  return namedMatrix(
    rows,
    cols,
    rows.map(() => cols.map(() => 1)),
  );
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function isSmRows(model: readonly unknown[]): model is readonly Readonly<SMRow>[] {
  return (
    model.length > 0 &&
    model.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as SMRow).source === "string" &&
        typeof (entry as SMRow).target === "string",
    )
  );
}

/**
 * Generate the DOT representation of a seminr model (plot_dot.R:245).
 *
 * Supports estimated and bootstrapped PLS models, specification-only
 * measurement/structural/specified models, and CFA/CBSEM models (a net-new
 * DOT design — R delegates those to semPlot).
 */
export function dotGraph(model: PlottableModel, options: DotGraphOptions = {}): string {
  if (!Array.isArray(model) && !(model instanceof SmMatrix)) {
    const kind = (model as { kind?: string }).kind;
    if (kind === "cfa" || kind === "cbsem") {
      return dotGraphCbsemFamily(model as CbsemModel | CfaModel, options);
    }
    if (kind === "pls" || kind === "boot") {
      return dotGraphPls(model as unknown as engine.PlotModel, options);
    }
    if (kind === "specified") return dotGraphSpecified(model as SpecifiedModel, options);
  }
  if (model instanceof SmMatrix) return dotGraphStructural(model, options);
  if (Array.isArray(model) && isSmRows(model)) {
    return dotGraphStructural(SmMatrix.from(model), options);
  }
  if (Array.isArray(model) && model.length > 0) {
    return dotGraphMeasurement(model as MeasurementModel, options);
  }
  throw new TypeError(
    "Whoops. This shouldn't have happened. Did you use a SEMinR model? " +
      "If yes, please let us know if this happens and how.",
  );
}

/** DOT for a measurement-model spec via an artificial model (plot_dot.R:326). */
function dotGraphMeasurement(model: MeasurementModel, options: DotGraphOptions): string {
  const thm = { ...(options.theme ?? seminrThemeGet()) };

  const mm = MmMatrix.fromMeasurementModel(model);
  const constructs = unique(mm.toRows().map((row) => row.construct));
  const mmVariables = unique(mm.toRows().map((row) => row.measurement));
  const unit = ones(mmVariables, constructs);

  const aModel: engine.PlotModel = {
    measurementModel: model,
    mmMatrix: mm,
    // every construct maps to itself so each shows up in the sm part
    smMatrix: SmMatrix.fromRows(constructs.map((c) => ({ source: c, target: c }))),
    outerWeights: unit,
    outerLoadings: unit,
    pathCoef: ones(constructs, constructs),
    constructs,
    mmVariables,
    hoc: model.some(
      (entry) => entry.kind === "construct" && (entry.type === "HOCA" || entry.type === "HOCB"),
    ),
  };

  // correct the theme for the artificial unit values
  thm.mmEdgeWidthMultiplier = 1;
  thm.mmEdgeLabelShow = false;
  return dotGraphPls(aModel, { ...options, theme: thm, measurementOnly: true });
}

/** DOT for a structural-model spec via an artificial model (plot_dot.R:415). */
function dotGraphStructural(model: SmMatrix, options: DotGraphOptions): string {
  const thm = { ...(options.theme ?? seminrThemeGet()) };

  const smConstructs = model.constructNames();
  const measurementModel: MeasurementModel = smConstructs.map((c) =>
    reflective(c, [`${c}_dummy`]),
  );
  const mm = MmMatrix.fromMeasurementModel(measurementModel);
  const constructs = unique(mm.toRows().map((row) => row.construct));
  const mmVariables = unique(mm.toRows().map((row) => row.measurement));
  const unit = ones(mmVariables, constructs);

  const aModel: engine.PlotModel = {
    measurementModel,
    mmMatrix: mm,
    smMatrix: model,
    outerWeights: unit,
    outerLoadings: unit,
    pathCoef: ones(smConstructs, smConstructs),
    constructs,
    mmVariables,
  };

  thm.smEdgeWidthMultiplier = 1;
  thm.smEdgeLabelShow = false;
  return dotGraphPls(aModel, { ...options, theme: thm, structureOnly: true });
}

/** DOT for a bundled (unestimated) model spec (plot_dot.R:486). */
function dotGraphSpecified(model: SpecifiedModel, options: DotGraphOptions): string {
  const thm = { ...(options.theme ?? seminrThemeGet()) };

  const measurementModel = model.measurementModel;
  const mm = MmMatrix.fromMeasurementModel(measurementModel);
  const constructs = unique(mm.toRows().map((row) => row.construct));
  const mmVariables = unique(mm.toRows().map((row) => row.measurement));
  const unit = ones(mmVariables, constructs);

  if (model.structuralModel === undefined) {
    throw new TypeError("Cannot plot a specified model without a structural model.");
  }

  const aModel: engine.PlotModel = {
    measurementModel,
    mmMatrix: mm,
    smMatrix: SmMatrix.from(model.structuralModel),
    outerWeights: unit,
    outerLoadings: unit,
    pathCoef: ones(constructs, constructs),
    constructs,
    mmVariables,
  };

  thm.smEdgeWidthMultiplier = 1;
  thm.smEdgeLabelShow = false;
  thm.mmEdgeWidthMultiplier = 1;
  thm.mmEdgeLabelShow = false;
  return dotGraphPls(aModel, { ...options, theme: thm });
}

/** DOT for an estimated (or bootstrapped) PLS model (plot_dot.R:602). */
function dotGraphPls(model: engine.PlotModel, options: DotGraphOptions): string {
  const {
    title = "",
    measurementOnly = false,
    structureOnly = false,
    alpha = 0.05,
  } = options;
  const thm = { ...(options.theme ?? seminrThemeGet()) };

  if (thm.plotTitle === "") thm.plotTitle = title;

  const globalStyle = engine.getGlobalStyle(thm);
  engine.resizeThemeNodes(model, thm);

  // do not change the order: some artificial models only work with one path
  const sm = measurementOnly
    ? engine.dotComponentSmParts(model, thm)
    : engine.dotComponentSm(model, thm, structureOnly, alpha);
  const mm = structureOnly ? "" : engine.dotComponentMm(model, thm);

  return `digraph G {\n\n${globalStyle}\n\n${sm}\n${mm}\n}`;
}

/**
 * DOT for CFA/CBSEM models — a net-new design on the shared engine.
 *
 * R seminr delegates these plots to `semPlot`, so there is no DOT to port;
 * this follows the py port's design (its plan Q4/D4): standardized loadings
 * on measurement edges, standardized paths plus R² on the structural part
 * (CBSEM), and dashed, non-constraining `dir=both` covariance edges for the
 * nonzero latent (psi) and item-error (theta) covariances. Residual variances
 * are omitted.
 */
function dotGraphCbsemFamily(model: CbsemModel | CfaModel, options: DotGraphOptions): string {
  const { title = "" } = options;
  const thm = { ...(options.theme ?? seminrThemeGet()) };
  if (thm.plotTitle === "") thm.plotTitle = title;

  const isCfa = model.kind === "cfa";
  const mm = model.mmMatrix;
  const latentSet = new Set(mm.allConstructs());
  const mmVariables = unique(
    mm
      .toRows()
      .map((row) => row.measurement)
      .filter((measurement) => !latentSet.has(measurement)),
  );

  let rSquared: NamedMatrix | undefined;
  const r2 = model.estimation.std.r2;
  const r2Cols = Object.keys(r2);
  if (!isCfa && r2Cols.length > 0) {
    // CBSEM has no adjusted R²; the AdjRsq row is NaN (shown only with plotAdj)
    rSquared = namedMatrix(["Rsq", "AdjRsq"], r2Cols, [
      r2Cols.map((c) => r2[c]!),
      r2Cols.map(() => Number.NaN),
    ]);
  }

  // the R structural-spec trick: self-loops put every construct in the sm part
  const smMatrix = isCfa
    ? SmMatrix.fromRows(model.constructs.map((c) => ({ source: c, target: c })))
    : (model as CbsemModel).smMatrix;

  const hasHoc = mm.allConstructs().some((c) => mm.isHoc(c));
  // union in dimension constructs so their measurement subgraphs render
  const firstStage = hasHoc
    ? { smMatrix: SmMatrix.fromRows(mm.allConstructs().map((c) => ({ source: c, target: c }))) }
    : undefined;

  const aModel: engine.PlotModel = {
    measurementModel: model.measurementModel,
    mmMatrix: mm,
    smMatrix,
    outerWeights: model.factorLoadings,
    outerLoadings: model.factorLoadings,
    pathCoef: isCfa
      ? ones([...model.constructs], [...model.constructs])
      : (model as CbsemModel).pathCoef,
    constructs: model.constructs,
    mmVariables,
    rSquared,
    hoc: hasHoc,
    firstStageModel: firstStage,
  };

  const globalStyle = engine.getGlobalStyle(thm);
  engine.resizeThemeNodes(aModel, thm);

  const sm = isCfa
    ? engine.dotComponentSmParts(aModel, thm)
    : engine.dotComponentSm(aModel, thm);
  const mmPart = engine.dotComponentMm(aModel, thm);
  const cov = dotComponentCovariances(model, thm);

  return `digraph G {\n\n${globalStyle}\n\n${sm}\n${mmPart}\n${cov}\n}`;
}

/** Covariance subgraph: dashed bidirectional arcs for psi/theta off-diagonals. */
function dotComponentCovariances(model: CbsemModel | CfaModel, theme: SeminrTheme): string {
  const std = model.estimation.std;
  const latents = model.estimation.parTable.latents;
  const observed = model.estimation.parTable.observed;

  const edge = (
    a: string,
    b: string,
    raw: number,
    multiplier: number,
    offset: number,
    posColor: string,
    negColor: string,
  ): string => {
    const value = rRound(raw, theme.plotRounding);
    const penwidth = Math.abs(value * multiplier) + offset;
    const color = value < 0 ? negColor : posColor;
    return (
      `"${a}" -> {"${b}"}` +
      `[label = < ${rNum(value)} >` +
      `, penwidth = ${rNum(penwidth)}` +
      ", constraint = false" +
      ", style = dashed" +
      `, color = ${color}]\n`
    );
  };

  let edges = "";
  for (let i = 0; i < latents.length - 1; i++) {
    for (let j = i + 1; j < latents.length; j++) {
      const raw = std.psi[i]![j]!;
      if (raw === 0 || Number.isNaN(raw)) continue; // skip structural zeros and NaN
      edges += edge(
        latents[i]!,
        latents[j]!,
        raw,
        theme.smEdgeWidthMultiplier,
        theme.smEdgeWidthOffset,
        theme.smEdgePositiveColor,
        theme.smEdgeNegativeColor,
      );
    }
  }
  for (let i = 0; i < observed.length - 1; i++) {
    for (let j = i + 1; j < observed.length; j++) {
      const raw = std.theta[i]![j]!;
      if (raw === 0 || Number.isNaN(raw)) continue;
      edges += edge(
        observed[i]!,
        observed[j]!,
        raw,
        theme.mmEdgeWidthMultiplier,
        theme.mmEdgeWidthOffset,
        theme.mmEdgePositiveColor,
        theme.mmEdgeNegativeColor,
      );
    }
  }

  return (
    "// ---------------------\n" +
    "// The covariances\n" +
    "// ---------------------\n" +
    "subgraph covariances {\n" +
    "edge [\n" +
    `color = ${theme.smEdgePositiveColor},\n` +
    `fontsize = ${rNum(theme.smEdgeLabelFontsize)},\n` +
    `fontcolor = ${theme.smEdgeLabelFontcolor},\n` +
    `fontname = ${theme.plotFontname},\n` +
    "dir = both,\n" +
    "arrowhead = normal,\n" +
    "arrowtail = normal\n" +
    "]\n" +
    `${edges}` +
    "}"
  );
}
