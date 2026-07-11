/**
 * Internal DOT-generation engine, ported from seminr's `plot_dot.R` via the
 * byte-parity-verified Python port (`seminr-py/src/seminr/plotting/_dot_engine.py`).
 *
 * Every string here is byte-parity-matched against R-generated fixtures
 * (`tests/fixtures/plots/`). R builds these strings with `glue` templates
 * whose trailing newline gets trimmed; this port writes the post-trim strings
 * directly, so take care when editing whitespace.
 *
 * R-source line references point at `../seminr/R/plot_dot.R`.
 */

import type { NamedMatrix } from "../math/matrix.ts";
import { nmGet } from "../math/matrix.ts";
import type { MmMatrix } from "../model/mmMatrix.ts";
import type { SmMatrix } from "../model/smMatrix.ts";
import { isInteraction } from "../model/smMatrix.ts";
import type { ConstructType, MeasurementModel } from "../specify/constructs.ts";
import type { BootModel } from "../bootstrap/bootstrap.ts";
import { summarizePlsBoot } from "../bootstrap/summarize.ts";
import { getConstructElementSize, getManifestElementSize } from "./metrics.ts";
import { psignr, pvalr, rNum, rRound } from "./rFormat.ts";
import type { SeminrTheme } from "./theme.ts";

/**
 * Any model-shaped object the engine draws: an estimated PLS model, a
 * bootstrapped model, or the artificial unit-valued stand-ins used for
 * specification-only and CBSEM/CFA plots. Structural typing keeps one
 * rendering path (the R code's "artificial model" trick).
 */
export interface PlotModel {
  readonly kind?: string;
  readonly measurementModel: MeasurementModel;
  readonly mmMatrix: MmMatrix;
  readonly smMatrix: SmMatrix;
  readonly outerWeights: NamedMatrix;
  readonly outerLoadings: NamedMatrix;
  readonly pathCoef: NamedMatrix;
  readonly constructs: readonly string[];
  readonly mmVariables: readonly string[];
  readonly rSquared?: NamedMatrix;
  readonly hoc?: boolean;
  readonly firstStageModel?: { readonly smMatrix: SmMatrix } | undefined;
}

/** Render a logical the way R interpolates it into strings. */
export function rBool(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

/** Interpolate `{key}` placeholders, as R's glue templates / py str.format. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function unique(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

/** Measurement type of a construct: mm entry type code, or "interaction". */
function typeOf(model: PlotModel, construct: string): ConstructType | "interaction" {
  if (isInteraction(construct)) return "interaction";
  for (const entry of model.measurementModel) {
    if (entry.kind === "construct" && entry.name === construct) return entry.type;
  }
  throw new Error(`Unknown construct: ${construct}`);
}

// ---------------------------------------------------------------------------
// Graph options (plot_dot.R:666-812)
// ---------------------------------------------------------------------------

/** Global graph settings block (plot_dot.R:673). */
export function getGlobalStyle(theme: SeminrTheme, layout = "dot"): string {
  return (
    "// ----------------------\n" +
    "// General graph settings\n" +
    "// ----------------------\n" +
    "graph [\n" +
    'charset = "UTF-8",\n' +
    `layout = ${layout},\n` +
    `label = "${theme.plotTitle}",\n` +
    `fontsize = ${rNum(theme.plotTitleFontsize)},\n` +
    `fontcolor = ${theme.plotTitleFontcolor},\n` +
    `fontname = ${theme.plotFontname},\n` +
    "rankdir = LR,\n" +
    "labelloc = t,\n" +
    `splines = ${rBool(theme.plotSplines)}\n` +
    `bgcolor = ${theme.plotBgcolor}\n` +
    "]"
  );
}

/** Rewrite theme node sizes from text metrics (plot_dot.R:626-631). */
export function resizeThemeNodes(model: PlotModel, theme: SeminrTheme): void {
  const construct = getConstructElementSize(model.constructs, theme);
  theme.smNodeWidth = construct.width;
  theme.smNodeHeight = construct.height * 2; // two lines (name + R^2)
  const manifest = getManifestElementSize(model.mmVariables, theme);
  theme.mmNodeWidth = manifest.width;
  theme.mmNodeHeight = manifest.height;
}

// ---------------------------------------------------------------------------
// Edge label formatting (plot_dot.R:748-761)
// ---------------------------------------------------------------------------

/** Format an edge label from a theme template (plot_dot.R:751). */
export function formatEdgeBootLabel(
  template: string,
  variable: string,
  value: number,
  tvalue: string,
  pvalue: string,
  stars: string,
  civalue: string,
): string {
  const content = fillTemplate(template, {
    variable,
    value: rNum(value),
    tvalue,
    pvalue,
    stars,
    civalue,
  });
  return `, label = < ${content} >`;
}

interface BootValues {
  mean: number;
  lower: number;
  upper: number;
  tvalue: number;
  p: number;
}

/**
 * Bootstrapped edge statistics from a summary table row (plot_dot.R:770).
 *
 * Column positions follow seminr's boot summary tables: original estimate,
 * boot mean, boot SD, t, lower CI, upper CI, empirical bootstrap p (used for
 * stars/p so plots agree with summary tables; seminr issue #412).
 */
export function extractBootstrappedValues(
  ltbl: NamedMatrix,
  rowIndex: string,
  theme: SeminrTheme,
): BootValues {
  const i = ltbl.rows.indexOf(rowIndex);
  if (i === -1) throw new Error(`Unknown boot summary row: ${rowIndex}`);
  const vals = ltbl.values[i]!;
  return {
    mean: rRound(vals[0]!, theme.plotRounding),
    lower: rRound(vals[4]!, theme.plotRounding),
    upper: rRound(vals[5]!, theme.plotRounding),
    tvalue: rRound(vals[3]!, theme.plotRounding),
    p: vals[6]!,
  };
}

function bootSummaryOf(model: PlotModel, alpha: number) {
  return summarizePlsBoot(model as unknown as BootModel, alpha);
}

function isBoot(model: PlotModel): boolean {
  return model.kind === "boot";
}

// ---------------------------------------------------------------------------
// 1. Structural model (plot_dot.R:817-1157)
// ---------------------------------------------------------------------------

/** The structural-model subgraph (plot_dot.R:821). */
export function dotComponentSm(
  model: PlotModel,
  theme: SeminrTheme,
  structureOnly = false,
  alpha = 0.05,
): string {
  return (
    "// --------------------\n" +
    "// The structural model\n" +
    "// --------------------\n" +
    "subgraph sm {\n" +
    "rankdir = LR;\n" +
    "node [\n" +
    `${getSmNodeStyle(theme)}\n` +
    "]\n" +
    `${extractSmNodes(model, theme, structureOnly)}\n` +
    "edge [\n" +
    `${getSmEdgeStyle(theme)}\n` +
    "]\n" +
    `${extractSmEdges(model, theme, 1, alpha)}\n` +
    "}"
  );
}

/** SM nodes only — used when plotting measurement models (plot_dot.R:844). */
export function dotComponentSmParts(model: PlotModel, theme: SeminrTheme): string {
  return (
    "// --------------------\n" +
    "// The structural model\n" +
    "// --------------------\n" +
    "subgraph sm {\n" +
    "rankdir = LR;\n" +
    "node [\n" +
    `${getSmNodeStyle(theme)}\n` +
    "]\n" +
    `${extractSmNodes(model, theme)}\n` +
    "}"
  );
}

/** All construct nodes, plus HOC dimension nodes (plot_dot.R:875). */
export function extractSmNodes(
  model: PlotModel,
  theme: SeminrTheme,
  structureOnly = false,
): string {
  const smNodes: string[] = [...model.constructs];
  for (const construct of model.constructs) {
    if (!structureOnly && model.mmMatrix.isHoc(construct)) {
      smNodes.push(...model.mmMatrix.constructItems(construct));
    }
  }
  return smNodes.map((node) => formatSmNode(node, model, theme)).join("\n");
}

/** One construct node with its (adj.) R^2 label when endogenous (plot_dot.R:904). */
export function formatSmNode(construct: string, model: PlotModel, theme: SeminrTheme): string {
  const squaredSymbol = theme.plotSpecialcharacters ? "²" : "^2";

  // rSquared row 1 is Rsq, row 2 AdjRsq
  const rIndex = theme.plotAdj ? 1 : 0;
  const rPrefix = theme.plotAdj ? "adj. " : "";

  const shapeString = getSmNodeShape(model, construct, theme);

  const rSquared = model.rSquared;
  let labelString: string;
  if (rSquared !== undefined && rSquared.cols.includes(construct)) {
    const value = rRound(nmGet(rSquared, rSquared.rows[rIndex]!, construct), theme.plotRounding);
    const rstring = `${rPrefix}R${squaredSymbol} = ${rNum(value)}`;
    labelString = fillTemplate(theme.smNodeEndoTemplate, { name: construct, rstring });
  } else {
    labelString = fillTemplate(theme.smNodeExoTemplate, { name: construct });
  }
  return `"${construct}" [label=<${labelString}>${shapeString}]`;
}

/** Style block for all SM nodes (plot_dot.R:950). */
export function getSmNodeStyle(theme: SeminrTheme): string {
  return (
    "shape = ellipse,\n" +
    `color = ${theme.smNodeColor},\n` +
    `fillcolor = ${theme.smNodeFill},\n` +
    "style = filled,\n" +
    `fontsize = ${rNum(theme.smNodeLabelFontsize)},\n` +
    `fontcolor = ${theme.smNodeLabelFontcolor},\n` +
    `height = ${rNum(theme.smNodeHeight)},\n` +
    `width = ${rNum(theme.smNodeWidth)},\n` +
    `fontname = ${theme.plotFontname},\n` +
    "fixedsize = true"
  );
}

const SM_SHAPE_BY_TYPE = (theme: SeminrTheme): Record<string, string> => ({
  interaction: "ellipse",
  C: theme.constructReflectiveShape,
  B: theme.constructCompositeBShape,
  A: theme.constructCompositeAShape,
  HOCA: theme.constructCompositeAShape,
  HOCB: theme.constructCompositeBShape,
  UNIT: theme.constructCompositeBShape,
});

/** Shape attribute for a construct node by its type (plot_dot.R:971). */
export function getSmNodeShape(model: PlotModel, construct: string, theme: SeminrTheme): string {
  const cType = typeOf(model, construct);
  return `, shape = ${SM_SHAPE_BY_TYPE(theme)[cType]}`;
}

/** One DOT edge per structural path (plot_dot.R:1013). */
export function extractSmEdges(
  model: PlotModel,
  theme: SeminrTheme,
  weights = 1,
  alpha = 0.05,
): string {
  // small beta / gamma (plot_dot.R:1024)
  const [beta, gamma] = theme.plotSpecialcharacters ? ["β", "γ"] : ["beta", "gamma"];

  const endogenous = new Set(model.rSquared?.cols ?? []);
  const smry = isBoot(model) ? bootSummaryOf(model, alpha) : null;

  const smEdges: string[] = [];
  for (const row of model.smMatrix.toRows()) {
    const { source, target } = row;

    // purely-exogenous sources take gamma
    const letter = theme.smEdgeLabelAllBetas ? beta : endogenous.has(source) ? beta : gamma;

    let tvalue = "";
    let pvalue = "";
    let stars = "";
    let civalue = "";
    let coef: number;
    if (smry !== null) {
      const rowIndex = `${source}  ->  ${target}`;
      const bootValues = extractBootstrappedValues(smry.bootstrappedPaths, rowIndex, theme);

      if (theme.smEdgeBootShowTValue) {
        tvalue = `t = ${rNum(rRound(bootValues.tvalue, theme.plotRounding))}`;
      }
      if (theme.smEdgeBootShowPValue) {
        pvalue = `p ${pvalr(bootValues.p, { html: true })}`;
      }
      if (theme.smEdgeBootShowPStars) stars = psignr(bootValues.p);
      if (theme.smEdgeBootShowCi) {
        const cl = (1 - alpha) * 100; // confidence level
        civalue = `${rNum(cl)}% CI [${rNum(bootValues.lower)}, ${rNum(bootValues.upper)}]`;
      }
      coef = bootValues.mean;
    } else {
      coef = rRound(nmGet(model.pathCoef, source, target), theme.plotRounding);
    }
    const penwidth = Math.abs(coef * theme.smEdgeWidthMultiplier) + theme.smEdgeWidthOffset;

    const edgeWidth = `, penwidth = ${rNum(penwidth)}`;
    const edgeStyle = getValueDependentSmEdgeStyle(coef, theme);

    const edgeLabel = theme.smEdgeLabelShow
      ? formatEdgeBootLabel(theme.smEdgeBootTemplate, letter, coef, tvalue, pvalue, stars, civalue)
      : "";

    const edgeWeight = `weight = ${rNum(weights)}`;
    smEdges.push(
      `"${source}" -> {"${target}"}[${edgeWeight}${edgeLabel}${edgeWidth}${edgeStyle}]`,
    );
  }
  return smEdges.join("\n");
}

/** Style block for all SM edges (plot_dot.R:1126). */
export function getSmEdgeStyle(theme: SeminrTheme): string {
  const minlenStr = theme.smEdgeMinlen !== null ? `minlen = ${rNum(theme.smEdgeMinlen)},` : "";
  return (
    `color = ${theme.smEdgePositiveColor},\n` +
    `fontsize = ${rNum(theme.smEdgeLabelFontsize)},\n` +
    `fontcolor = ${theme.smEdgeLabelFontcolor},\n` +
    `fontname = ${theme.plotFontname},\n` +
    `${minlenStr}` +
    "dir = both,\n" +
    "arrowhead = normal,\n" +
    "arrowtail = none"
  );
}

/** Sign-dependent style/color for an SM edge (plot_dot.R:1149). */
export function getValueDependentSmEdgeStyle(value: number, theme: SeminrTheme): string {
  if (value < 0) {
    return `, style = ${theme.smEdgeNegativeStyle}, color = ${theme.smEdgeNegativeColor}`;
  }
  return `, style = ${theme.smEdgePositiveStyle}, color = ${theme.smEdgePositiveColor}`;
}

// ---------------------------------------------------------------------------
// 2. Measurement model (plot_dot.R:1161-1629)
// ---------------------------------------------------------------------------

interface MmCoding {
  name: string;
  type: string;
}

/**
 * (name, type) pairs for constructs in the model (plot_dot.R:1279).
 *
 * Mirrors R's `constructs_in_model()` name logic: structural constructs that
 * appear in the measurement model, unioned with first-stage names for HOC
 * models.
 */
export function extractMmCoding(model: PlotModel): MmCoding[] {
  const mmConstructs = new Set(model.mmMatrix.allConstructs());
  let smNames = model.smMatrix.constructNames();
  if (model.hoc && model.firstStageModel !== undefined) {
    smNames = unique([...smNames, ...model.firstStageModel.smMatrix.constructNames()]);
  }
  return smNames
    .filter((c) => mmConstructs.has(c))
    .map((name) => ({ name, type: String(typeOf(model, name)) }));
}

/**
 * Whether the index-th construct is a pure sink (plot_dot.R:1173).
 * `index` is 1-based, as in R.
 */
export function isOnlyEndogenous(model: PlotModel, index: number): boolean {
  const { name, type } = extractMmCoding(model)[index - 1]!;

  // Lower-order constructs measured by a HOC can never be sinks.
  const parentConstruct = model.mmMatrix.constructOfItem(name);
  if (parentConstruct !== undefined && model.mmMatrix.isHoc(parentConstruct)) return false;

  // R checks the whole mm_coding row (name and type) for membership.
  const exogenous = new Set(model.smMatrix.allExogenous());
  return !(exogenous.has(name) || exogenous.has(type));
}

/** The full measurement-model component (plot_dot.R:1201). */
export function dotComponentMm(model: PlotModel, theme: SeminrTheme): string {
  const subComponents = [
    "// ---------------------\n// The measurement model\n// ---------------------\n",
  ];
  const mmCount = extractMmCoding(model).length;
  for (let index = 1; index <= mmCount; index++) {
    subComponents.push(dotSubcomponentMm(index, model, theme));
  }
  return subComponents.join("\n");
}

/** The measurement subgraph for one construct (plot_dot.R:1228). 1-based index. */
export function dotSubcomponentMm(index: number, model: PlotModel, theme: SeminrTheme): string {
  const { type } = extractMmCoding(model)[index - 1]!;

  // no measurement subgraph for interaction terms
  if (type === "interaction") return "";

  const nodeStyle = getMmNodeStyle(theme);
  const flip = isOnlyEndogenous(model, index);
  const edgeStyle = getMmEdgeStyle(theme, type, flip);
  const nodes = extractMmNodes(index, model, theme);
  const edges = extractMmEdges(index, model, theme);

  return (
    `subgraph construct_${index} {\n` +
    "node [\n" +
    `${nodeStyle}\n` +
    "]\n" +
    `${nodes}\n` +
    "edge [\n" +
    `${edgeStyle}\n` +
    "]\n" +
    `${edges}\n` +
    "}"
  );
}

/** Style block for MM nodes (plot_dot.R:1298). */
export function getMmNodeStyle(theme: SeminrTheme): string {
  return (
    "shape = box,\n" +
    `color = ${theme.mmNodeColor},\n` +
    `fillcolor = ${theme.mmNodeFill},\n` +
    "style = filled,\n" +
    `fontsize = ${rNum(theme.mmNodeLabelFontsize)},\n` +
    `fontcolor = ${theme.mmNodeLabelFontcolor},\n` +
    `height = ${rNum(theme.mmNodeHeight)},\n` +
    `width = ${rNum(theme.mmNodeWidth)},\n` +
    `fontname = ${theme.plotFontname},\n` +
    "fixedsize = true"
  );
}

/** Item nodes of a construct's measurement subgraph (plot_dot.R:1318). */
export function extractMmNodes(index: number, model: PlotModel, theme: SeminrTheme): string {
  const { name } = extractMmCoding(model)[index - 1]!;
  const items = model.mmMatrix.constructItems(name);
  const shape = getMmNodeShape(model, name, theme);
  return items.map((item) => `"${item}" [label = "${item}"${shape}]`).join("\n");
}

const MM_SHAPE_BY_TYPE = (theme: SeminrTheme): Record<string, string> => ({
  interaction: "ellipse",
  C: theme.manifestReflectiveShape,
  B: theme.manifestCompositeBShape,
  A: theme.manifestCompositeAShape,
  HOCA: theme.manifestCompositeAShape,
  HOCB: theme.manifestCompositeBShape,
  UNIT: theme.constructCompositeBShape,
});

/** Shape attribute for manifest nodes by construct type (plot_dot.R:1340). */
export function getMmNodeShape(model: PlotModel, construct: string, theme: SeminrTheme): string {
  const cType = typeOf(model, construct);
  return `, shape = ${MM_SHAPE_BY_TYPE(theme)[cType]}`;
}

/** Per-construct-type MM edge style, with sink flip (plot_dot.R:1366). */
export function getMmEdgeStyle(theme: SeminrTheme, cType: string, flip = false): string {
  let direction: string;
  if (cType === "C") direction = theme.constructReflectiveArrow;
  else if (cType === "A" || cType === "HOCA") direction = theme.constructCompositeAArrow;
  else direction = theme.constructCompositeBArrow; // B, HOCB, UNIT

  if (flip) {
    if (direction === "forward") direction = "backward";
    else if (direction === "backward") direction = "forward";
  }

  let arrowhead: string;
  let arrowtail: string;
  if (direction === "forward") [arrowhead, arrowtail] = ["normal", "none"];
  else if (direction === "backward") [arrowhead, arrowtail] = ["none", "normal"];
  else [arrowhead, arrowtail] = ["none", "none"];

  const minlenStr = theme.mmEdgeMinlen !== null ? `minlen = ${rNum(theme.mmEdgeMinlen)},` : "";

  return [
    `color = ${theme.mmEdgePositiveColor},`,
    `fontsize = ${rNum(theme.mmEdgeLabelFontsize)},`,
    `fontcolor = ${theme.mmEdgeLabelFontcolor},`,
    `fontname = ${theme.plotFontname},`,
    minlenStr,
    "dir = both",
    `arrowhead = ${arrowhead}`,
    `arrowtail = ${arrowtail}`,
  ].join("\n");
}

/** Whether a construct type labels edges with weights (plot_dot.R:1466). */
export function useConstructWeights(theme: SeminrTheme, cType: string): boolean {
  if (cType === "C") return theme.constructReflectiveUseWeights;
  if (cType === "A" || cType === "HOCA") return theme.constructCompositeAUseWeights;
  return theme.constructCompositeBUseWeights; // B, HOCB, UNIT
}

/** Loading or weight for an MM edge (plot_dot.R:1428). */
export function extractMmEdgeValue(
  model: PlotModel,
  theme: SeminrTheme,
  indicator: string,
  construct: string,
): number {
  const value = useConstructWeights(theme, String(typeOf(model, construct)))
    ? nmGet(model.outerWeights, indicator, construct)
    : nmGet(model.outerLoadings, indicator, construct);
  return rRound(value, theme.plotRounding);
}

/** All MM edges of one construct's subgraph (plot_dot.R:1487). Ends with newline. */
export function extractMmEdges(
  index: number,
  model: PlotModel,
  theme: SeminrTheme,
  weights = 1000,
): string {
  const { name: construct } = extractMmCoding(model)[index - 1]!;
  const items = model.mmMatrix.constructItems(construct);

  const lam = theme.plotSpecialcharacters ? "λ" : "lambda";

  // R calls summary(model) here with its default alpha, so MM boot labels
  // always report the 95% interval regardless of the plot's alpha.
  const smry = isBoot(model) ? bootSummaryOf(model, 0.05) : null;

  let edges = "";
  for (const manifestVariable of items) {
    // interaction product terms carry no measurement edge
    if (isInteraction(manifestVariable)) continue;

    const useWeights = useConstructWeights(theme, String(typeOf(model, construct)));
    const letter = useWeights ? "w" : lam;

    let tvalue = "";
    let pvalue = "";
    let stars = "";
    let civalue = "";
    if (smry !== null) {
      const rowIndex = `${manifestVariable}  ->  ${construct}`;
      const ltbl = useWeights ? smry.bootstrappedWeights : smry.bootstrappedLoadings;
      const bootValues = extractBootstrappedValues(ltbl, rowIndex, theme);

      if (theme.mmEdgeBootShowTValue) {
        tvalue = `t = ${rNum(rRound(bootValues.tvalue, theme.plotRounding))}`;
      }
      if (theme.mmEdgeBootShowPValue) pvalue = `p ${pvalr(bootValues.p, { html: true })}`;
      if (theme.mmEdgeBootShowPStars) stars = psignr(bootValues.p);
      if (theme.mmEdgeBootShowCi) {
        civalue = `95% CI [${rNum(bootValues.lower)}, ${rNum(bootValues.upper)}]`;
      }
    }

    const loading = extractMmEdgeValue(model, theme, manifestVariable, construct);

    const edgeLabel = theme.mmEdgeLabelShow
      ? formatEdgeBootLabel(theme.mmEdgeBootTemplate, letter, loading, tvalue, pvalue, stars, civalue)
      : "";

    const edgeStyle = getValueDependentMmEdgeStyle(loading, theme);

    const [sourceNode, targetNode] = isOnlyEndogenous(model, index)
      ? [construct, manifestVariable]
      : [manifestVariable, construct];

    const penwidth = Math.abs(loading * theme.mmEdgeWidthMultiplier) + theme.mmEdgeWidthOffset;
    edges +=
      `"${sourceNode}" -> {"${targetNode}"}` +
      `[weight = ${rNum(weights)}${edgeLabel}, penwidth = ${rNum(penwidth)}${edgeStyle}]\n`;
  }
  return edges;
}

/** Sign-dependent style/color for an MM edge (plot_dot.R:1621). */
export function getValueDependentMmEdgeStyle(value: number, theme: SeminrTheme): string {
  if (value < 0) {
    return `, style = ${theme.mmEdgeNegativeStyle}, color = ${theme.mmEdgeNegativeColor}`;
  }
  return `, style = ${theme.mmEdgePositiveStyle}, color = ${theme.mmEdgePositiveColor}`;
}
