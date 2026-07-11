/**
 * HTMT discriminant-validity network plot, ported from seminr's `plot_htmt.R`.
 *
 * An undirected construct graph on a bootstrapped model: edge labels carry the
 * bootstrapped HTMT mean and its 95% CI, and edges whose (mean or CI-upper)
 * value exceeds the threshold render red/solid; sub-threshold edges are hidden
 * by default.
 */

import type { BootModel } from "../bootstrap/bootstrap.ts";
import { summarizePlsBoot } from "../bootstrap/summarize.ts";
import { getConstructElementSize } from "./metrics.ts";
import { rNum, rRound } from "./rFormat.ts";
import { seminrThemeGet, type SeminrTheme } from "./theme.ts";

export interface DotGraphHtmtOptions {
  title?: string;
  theme?: SeminrTheme;
  htmtThreshold?: number;
  omitThresholdEdges?: boolean;
  useCi?: boolean;
}

/** DOT string of the HTMT construct network (plot_htmt.R:22). */
export function dotGraphHtmt(model: BootModel, options: DotGraphHtmtOptions = {}): string {
  if ((model as { kind?: string }).kind !== "boot") {
    throw new TypeError("Plotting HTMT models only works with bootstrapped models");
  }
  const {
    title = "HTMT Plot",
    htmtThreshold = 1,
    omitThresholdEdges = true,
    useCi = false,
  } = options;

  const thm = { ...(options.theme ?? seminrThemeGet()) };
  thm.plotTitle = title;

  const globalStyle = getGlobalHtmtStyle(thm);

  const { width, height } = getConstructElementSize(model.constructs, thm);
  thm.smNodeWidth = width;
  thm.smNodeHeight = height;

  const htmtComponent = dotComponentHtmt(model, thm, htmtThreshold, omitThresholdEdges, useCi);

  return `graph G {\n\n${globalStyle}\n\n${htmtComponent}\n}`;
}

/** Global graph settings for the HTMT plot (plot_htmt.R:86). */
export function getGlobalHtmtStyle(theme: SeminrTheme, layout = "dot"): string {
  return (
    "// ----------------------\n" +
    "// General graph settings\n" +
    "// ----------------------\n" +
    "graph [\n" +
    'charset = "UTF-8",\n' +
    `layout = ${layout},\n` +
    `label = "${theme.plotTitle}",\n` +
    `fontsize = ${rNum(theme.plotTitleFontsize)},\n` +
    `fontname = ${theme.plotFontname},\n` +
    "rankdir = LR,\n" +
    "labelloc = t,\n" +
    "ranksep = 0.5,\n" +
    "nodesep = 0.5,\n" +
    `splines = ${theme.plotSplines ? "TRUE" : "FALSE"}\n` +
    "]"
  );
}

/** Node style block (plot_htmt.R:222). */
export function getHtmtNodeStyle(theme: SeminrTheme): string {
  return (
    "shape = ellipse,\n" +
    `color = ${theme.smNodeColor},\n` +
    `fillcolor = ${theme.smNodeFill},\n` +
    "style = filled,\n" +
    `fontsize = ${rNum(theme.smNodeLabelFontsize)},\n` +
    `height = ${rNum(theme.smNodeHeight)},\n` +
    `width = ${rNum(theme.smNodeWidth)},\n` +
    `fontname = ${theme.plotFontname},\n` +
    "fixedsize = true"
  );
}

/** Edge style block (plot_htmt.R:176). */
export function getHtmtEdgeStyle(theme: SeminrTheme): string {
  const minlenStr = theme.smEdgeMinlen !== null ? `minlen = ${rNum(theme.smEdgeMinlen)},` : "";
  return (
    `color = ${theme.smEdgePositiveColor},\n` +
    `fontsize = ${rNum(theme.smEdgeLabelFontsize)},\n` +
    `fontname = ${theme.plotFontname},\n` +
    `${minlenStr}` +
    "dir = both,\n" +
    "arrowhead = none,\n" +
    "arrowtail = none"
  );
}

/** Upper-triangle HTMT edges with CI labels and threshold styling (plot_htmt.R:106). */
export function extractHtmtEdges(
  model: BootModel,
  theme: SeminrTheme,
  htmtThreshold = 1,
  omitThresholdEdges = true,
  useCi = false,
): string {
  const constructs = model.constructs;
  const htmtTbl = summarizePlsBoot(model).bootstrappedHtmt;

  let gr = "";
  for (let i = 0; i < constructs.length - 1; i++) {
    for (let j = i + 1; j < constructs.length; j++) {
      const smryIndex = `${constructs[i]}  ->  ${constructs[j]}`;
      const row = htmtTbl.rows.indexOf(smryIndex);
      if (row === -1) throw new Error(`Unknown HTMT summary row: ${smryIndex}`);

      const value = rRound(htmtTbl.values[row]![1]!, theme.plotRounding);
      const cilower = rRound(htmtTbl.values[row]![4]!, theme.plotRounding);
      const ciupper = rRound(htmtTbl.values[row]![5]!, theme.plotRounding);

      const cistring = `95% CI [${rNum(cilower)}; ${rNum(ciupper)}]`;

      const cmpValue = useCi ? ciupper : value;

      const edgeLabel = `${rNum(value)}<BR/>${cistring}`;
      const penwidth = value * theme.mmEdgeWidthMultiplier + 0.2;

      const [edgecolor, edgestyle] =
        cmpValue > htmtThreshold
          ? ["red", theme.smEdgePositiveStyle]
          : ["black", theme.smEdgeNegativeStyle];

      if (!omitThresholdEdges || cmpValue > htmtThreshold) {
        const weight = rRound(constructs.length / value, theme.plotRounding);
        gr +=
          `"${constructs[i]}" -- "${constructs[j]}"` +
          ` [label = <${edgeLabel}>` +
          `, penwidth = ${rNum(penwidth)}` +
          `, weight = ${rNum(weight)}` +
          `, color = ${edgecolor}` +
          `, style = ${edgestyle}` +
          "]" +
          "\n";
      }
    }
  }
  return gr;
}

/** The HTMT graph body: node/edge styles and edges (plot_htmt.R:236). */
export function dotComponentHtmt(
  model: BootModel,
  theme: SeminrTheme,
  htmtThreshold: number,
  omitThresholdEdges: boolean,
  useCi: boolean,
): string {
  const htmtEdges = extractHtmtEdges(model, theme, htmtThreshold, omitThresholdEdges, useCi);
  return (
    "// --------------------\n" +
    "// The htmt model\n" +
    "// --------------------\n" +
    "node [\n" +
    `${getHtmtNodeStyle(theme)}\n` +
    "]\n" +
    "edge [\n" +
    `${getHtmtEdgeStyle(theme)}\n` +
    "]\n" +
    `${htmtEdges}\n`
  );
}
