/**
 * Plotting theme system, as seminr's `theme.R`/`theme_defaults.R`/
 * `theme_current.R`. R's dotted option names (`plot.title.fontsize`) become
 * camelCase field names (`plotTitleFontsize`). Label templates keep R's glue
 * placeholders (`{name}`, `{value}`, ...), interpolated by the DOT engine.
 */

import { R_COLORS } from "./rColors.ts";

export type ThemeArrow = "forward" | "backward" | "none";

/** Default template for labeling endogenous construct nodes (theme.R:272). */
export function nodeEndoTemplateDefault(): string {
  return "<B>{name} </B><BR /><FONT POINT-SIZE='10'>{rstring}</FONT>";
}

/** Default template for labeling exogenous construct nodes (theme.R:282). */
export function nodeExoTemplateDefault(): string {
  return "<B>{name} </B>";
}

/** Default template for labeling bootstrapped edges (theme.R:291). */
export function edgeTemplateDefault(): string {
  return (
    "{variable} = {value}{stars}" +
    "<BR /><FONT POINT-SIZE='7'>{civalue} {tvalue} {pvalue} </FONT>"
  );
}

/** Minimal bootstrapped-edge template: bootstrapped mean only (theme.R:302). */
export function edgeTemplateMinimal(): string {
  return "{variable} = {value}{stars}";
}

/**
 * A seminr plotting theme (the `seminr_theme` list of theme.R:195-262).
 * Mutable by design: the DOT engine rewrites node sizes and, for
 * specification-only plots, edge multipliers/label visibility on a copy.
 */
export interface SeminrTheme {
  plotTitle: string;
  plotTitleFontcolor: string;
  plotTitleFontsize: number;
  plotFontname: string;
  plotSplines: boolean;
  plotRounding: number;
  plotAdj: boolean;
  plotSpecialcharacters: boolean;
  plotRandomizedweights: boolean;
  plotBgcolor: string;
  mmNodeColor: string;
  mmNodeFill: string;
  mmNodeLabelFontsize: number;
  mmNodeLabelFontcolor: string;
  mmNodeHeight: number;
  mmNodeWidth: number;
  mmEdgePositiveColor: string;
  mmEdgeNegativeColor: string;
  mmEdgePositiveStyle: string;
  mmEdgeNegativeStyle: string;
  mmEdgeLabelFontsize: number;
  mmEdgeLabelFontcolor: string;
  mmEdgeLabelShow: boolean;
  mmEdgeWidthMultiplier: number;
  mmEdgeWidthOffset: number;
  /** null mirrors R's NA_integer_ (omit the minlen attribute). */
  mmEdgeMinlen: number | null;
  mmEdgeUseOuterWeights: boolean;
  mmEdgeBootShowTValue: boolean;
  mmEdgeBootShowPValue: boolean;
  mmEdgeBootShowPStars: boolean;
  mmEdgeBootShowCi: boolean;
  mmEdgeBootTemplate: string;
  smNodeColor: string;
  smNodeFill: string;
  smNodeLabelFontsize: number;
  smNodeLabelFontcolor: string;
  smNodeHeight: number;
  smNodeWidth: number;
  smNodeEndoTemplate: string;
  smNodeExoTemplate: string;
  smEdgePositiveColor: string;
  smEdgeNegativeColor: string;
  smEdgePositiveStyle: string;
  smEdgeNegativeStyle: string;
  smEdgeLabelFontsize: number;
  smEdgeLabelFontcolor: string;
  smEdgeLabelShow: boolean;
  smEdgeLabelAllBetas: boolean;
  smEdgeBootShowTValue: boolean;
  smEdgeBootShowPValue: boolean;
  smEdgeBootShowPStars: boolean;
  smEdgeBootShowCi: boolean;
  smEdgeBootTemplate: string;
  smEdgeWidthMultiplier: number;
  smEdgeWidthOffset: number;
  smEdgeMinlen: number | null;
  constructReflectiveShape: string;
  constructReflectiveArrow: ThemeArrow;
  constructReflectiveUseWeights: boolean;
  constructCompositeAShape: string;
  constructCompositeAArrow: ThemeArrow;
  constructCompositeAUseWeights: boolean;
  constructCompositeBShape: string;
  constructCompositeBArrow: ThemeArrow;
  constructCompositeBUseWeights: boolean;
  manifestReflectiveShape: string;
  manifestCompositeAShape: string;
  manifestCompositeBShape: string;
}

/** User-facing options of {@link seminrThemeCreate} (theme.R:88 arguments). */
export type SeminrThemeOptions = Partial<
  Omit<SeminrTheme, "plotTitle" | "mmNodeHeight" | "mmNodeWidth" | "smNodeHeight" | "smNodeWidth">
>;

const ARROW_OPTIONS: readonly string[] = ["forward", "backward", "none"];

/** R `stopifnot` analogue. */
function require(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function isNumeric(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

const KNOWN_OPTIONS: ReadonlySet<string> = new Set([
  "plotTitleFontsize", "plotTitleFontcolor", "plotFontname", "plotSplines",
  "plotRounding", "plotAdj", "plotSpecialcharacters", "plotRandomizedweights",
  "plotBgcolor", "mmNodeColor", "mmNodeFill", "mmNodeLabelFontsize",
  "mmNodeLabelFontcolor", "mmEdgePositiveColor", "mmEdgeNegativeColor",
  "mmEdgePositiveStyle", "mmEdgeNegativeStyle", "mmEdgeLabelFontsize",
  "mmEdgeLabelFontcolor", "mmEdgeLabelShow", "mmEdgeMinlen",
  "mmEdgeWidthMultiplier", "mmEdgeWidthOffset", "mmEdgeUseOuterWeights",
  "mmEdgeBootShowTValue", "mmEdgeBootShowPValue", "mmEdgeBootShowPStars",
  "mmEdgeBootShowCi", "mmEdgeBootTemplate", "smNodeColor", "smNodeFill",
  "smNodeLabelFontsize", "smNodeLabelFontcolor", "smNodeEndoTemplate",
  "smNodeExoTemplate", "smEdgeBootShowTValue", "smEdgeBootShowPValue",
  "smEdgeBootShowPStars", "smEdgeBootShowCi", "smEdgeBootTemplate",
  "smEdgePositiveColor", "smEdgeNegativeColor", "smEdgePositiveStyle",
  "smEdgeNegativeStyle", "smEdgeLabelFontsize", "smEdgeLabelFontcolor",
  "smEdgeLabelShow", "smEdgeLabelAllBetas", "smEdgeMinlen",
  "smEdgeWidthOffset", "smEdgeWidthMultiplier", "constructReflectiveShape",
  "constructReflectiveArrow", "constructReflectiveUseWeights",
  "constructCompositeAShape", "constructCompositeAArrow",
  "constructCompositeAUseWeights", "constructCompositeBShape",
  "constructCompositeBArrow", "constructCompositeBUseWeights",
  "manifestReflectiveShape", "manifestCompositeAShape", "manifestCompositeBShape",
]);

/**
 * Create a plotting theme, as seminr's `seminr_theme_create()` (theme.R:88).
 * Unknown options warn (as R does) rather than error.
 */
export function seminrThemeCreate(options: SeminrThemeOptions = {}): SeminrTheme {
  const unused = Object.keys(options).filter((k) => !KNOWN_OPTIONS.has(k));
  if (unused.length > 0) {
    const details = unused
      .map((k) => `   - ${k} = ${(options as Record<string, unknown>)[k]}`)
      .join("\n");
    console.warn(
      "The following parameters are unused or ignored: \n" +
        `${details}.\n Either check for typos or remove them to suppress this warning.`,
    );
  }

  let plotFontname = options.plotFontname ?? "helvetica";
  if (plotFontname.includes(" ")) plotFontname = `'${plotFontname}'`;

  const theme: SeminrTheme = {
    plotTitle: "",
    plotTitleFontcolor: options.plotTitleFontcolor ?? "black",
    plotTitleFontsize: options.plotTitleFontsize ?? 24,
    plotFontname,
    plotSplines: options.plotSplines ?? true,
    plotRounding: options.plotRounding ?? 3,
    plotAdj: options.plotAdj ?? false,
    plotSpecialcharacters: options.plotSpecialcharacters ?? true,
    plotRandomizedweights: options.plotRandomizedweights ?? false,
    plotBgcolor: options.plotBgcolor ?? "transparent",
    mmNodeColor: options.mmNodeColor ?? "dimgrey",
    mmNodeFill: options.mmNodeFill ?? "white",
    mmNodeLabelFontsize: options.mmNodeLabelFontsize ?? 8,
    mmNodeLabelFontcolor: options.mmNodeLabelFontcolor ?? "black",
    mmNodeHeight: 1,
    mmNodeWidth: 1,
    mmEdgePositiveColor: options.mmEdgePositiveColor ?? "dimgrey",
    mmEdgeNegativeColor: options.mmEdgeNegativeColor ?? "dimgrey",
    mmEdgePositiveStyle: options.mmEdgePositiveStyle ?? "solid",
    mmEdgeNegativeStyle: options.mmEdgeNegativeStyle ?? "dashed",
    mmEdgeLabelFontsize: options.mmEdgeLabelFontsize ?? 7,
    mmEdgeLabelFontcolor: options.mmEdgeLabelFontcolor ?? "black",
    mmEdgeLabelShow: options.mmEdgeLabelShow ?? true,
    mmEdgeWidthMultiplier: options.mmEdgeWidthMultiplier ?? 3,
    mmEdgeWidthOffset: options.mmEdgeWidthOffset ?? 0.5,
    mmEdgeMinlen: options.mmEdgeMinlen === undefined ? 1 : options.mmEdgeMinlen,
    mmEdgeUseOuterWeights: options.mmEdgeUseOuterWeights ?? true,
    mmEdgeBootShowTValue: options.mmEdgeBootShowTValue ?? false,
    mmEdgeBootShowPValue: options.mmEdgeBootShowPValue ?? false,
    mmEdgeBootShowPStars: options.mmEdgeBootShowPStars ?? true,
    mmEdgeBootShowCi: options.mmEdgeBootShowCi ?? false,
    mmEdgeBootTemplate: options.mmEdgeBootTemplate ?? edgeTemplateMinimal(),
    smNodeColor: options.smNodeColor ?? "black",
    smNodeFill: options.smNodeFill ?? "white",
    smNodeLabelFontsize: options.smNodeLabelFontsize ?? 12,
    smNodeLabelFontcolor: options.smNodeLabelFontcolor ?? "black",
    smNodeHeight: 1,
    smNodeWidth: 1,
    smNodeEndoTemplate: options.smNodeEndoTemplate ?? nodeEndoTemplateDefault(),
    smNodeExoTemplate: options.smNodeExoTemplate ?? nodeExoTemplateDefault(),
    smEdgePositiveColor: options.smEdgePositiveColor ?? "black",
    smEdgeNegativeColor: options.smEdgeNegativeColor ?? "black",
    smEdgePositiveStyle: options.smEdgePositiveStyle ?? "solid",
    smEdgeNegativeStyle: options.smEdgeNegativeStyle ?? "dashed",
    smEdgeLabelFontsize: options.smEdgeLabelFontsize ?? 9,
    smEdgeLabelFontcolor: options.smEdgeLabelFontcolor ?? "black",
    smEdgeLabelShow: options.smEdgeLabelShow ?? true,
    smEdgeLabelAllBetas: options.smEdgeLabelAllBetas ?? true,
    smEdgeBootShowTValue: options.smEdgeBootShowTValue ?? false,
    smEdgeBootShowPValue: options.smEdgeBootShowPValue ?? false,
    smEdgeBootShowPStars: options.smEdgeBootShowPStars ?? true,
    smEdgeBootShowCi: options.smEdgeBootShowCi ?? true,
    smEdgeBootTemplate: options.smEdgeBootTemplate ?? edgeTemplateDefault(),
    smEdgeWidthMultiplier: options.smEdgeWidthMultiplier ?? 5,
    // Faithful to theme.R:249, which hardcodes 0.5 and ignores the
    // sm.edge.width_offset argument.
    smEdgeWidthOffset: 0.5,
    smEdgeMinlen: options.smEdgeMinlen === undefined ? null : options.smEdgeMinlen,
    constructReflectiveShape: options.constructReflectiveShape ?? "ellipse",
    constructReflectiveArrow: options.constructReflectiveArrow ?? "backward",
    constructReflectiveUseWeights: options.constructReflectiveUseWeights ?? false,
    constructCompositeAShape: options.constructCompositeAShape ?? "hexagon",
    constructCompositeAArrow: options.constructCompositeAArrow ?? "backward",
    constructCompositeAUseWeights: options.constructCompositeAUseWeights ?? false,
    constructCompositeBShape: options.constructCompositeBShape ?? "hexagon",
    constructCompositeBArrow: options.constructCompositeBArrow ?? "forward",
    constructCompositeBUseWeights: options.constructCompositeBUseWeights ?? true,
    manifestReflectiveShape: options.manifestReflectiveShape ?? "box",
    manifestCompositeAShape: options.manifestCompositeAShape ?? "box",
    manifestCompositeBShape: options.manifestCompositeBShape ?? "box",
  };

  require(
    ARROW_OPTIONS.includes(theme.constructReflectiveArrow) &&
      ARROW_OPTIONS.includes(theme.constructCompositeAArrow) &&
      ARROW_OPTIONS.includes(theme.constructCompositeBArrow),
    "Arrows can be one of: forward, backward, none.",
  );
  require(
    R_COLORS.has(theme.mmNodeColor) &&
      R_COLORS.has(theme.smNodeColor) &&
      R_COLORS.has(theme.mmEdgePositiveColor) &&
      R_COLORS.has(theme.mmEdgeNegativeColor) &&
      R_COLORS.has(theme.smEdgePositiveColor) &&
      R_COLORS.has(theme.smEdgeNegativeColor) &&
      R_COLORS.has(theme.mmNodeFill) &&
      R_COLORS.has(theme.smNodeFill),
    "Illegal color-value. Use grDevices::colors() to find legal colors.",
  );
  require(isNumeric(theme.plotRounding), "plotRounding must be numeric");
  require(
    isNumeric(theme.plotTitleFontsize) &&
      isNumeric(theme.mmNodeLabelFontsize) &&
      isNumeric(theme.smNodeLabelFontsize) &&
      isNumeric(theme.mmEdgeLabelFontsize) &&
      isNumeric(theme.smEdgeLabelFontsize),
    "font sizes must be numeric",
  );
  require(typeof theme.plotSplines === "boolean", "plotSplines must be logical");
  require(typeof theme.plotAdj === "boolean", "plotAdj must be logical");
  require(
    typeof theme.mmEdgeUseOuterWeights === "boolean" &&
      typeof theme.smEdgeBootShowTValue === "boolean" &&
      typeof theme.smEdgeBootShowPValue === "boolean" &&
      typeof theme.smEdgeBootShowCi === "boolean",
    "edge boot options must be logical",
  );

  return theme;
}

/** The default seminr theme (theme_defaults.R:90). */
export function seminrThemeDefault(options: SeminrThemeOptions = {}): SeminrTheme {
  return seminrThemeCreate(options);
}

/** A basic black/white theme (theme_defaults.R:15). */
export function seminrThemeAcademic(): SeminrTheme {
  return seminrThemeCreate({
    constructReflectiveShape: "ellipse",
    constructReflectiveArrow: "backward",
    constructReflectiveUseWeights: false,
    constructCompositeAShape: "ellipse",
    constructCompositeAArrow: "backward",
    constructCompositeAUseWeights: false,
    constructCompositeBShape: "ellipse",
    constructCompositeBArrow: "forward",
    constructCompositeBUseWeights: true,
    manifestReflectiveShape: "box",
    manifestCompositeAShape: "box",
    manifestCompositeBShape: "box",
  });
}

/** A colored theme (theme_defaults.R:49). */
export function seminrThemeSmart(): SeminrTheme {
  return seminrThemeCreate({
    smNodeFill: "lightcyan",
    mmNodeFill: "lightgoldenrodyellow",
    constructCompositeAArrow: "backward",
    constructCompositeBArrow: "forward",
    constructCompositeAUseWeights: false,
    constructCompositeBUseWeights: true,
  });
}

/** An inverted theme on black background (theme_defaults.R:134). */
export function seminrThemeDark(): SeminrTheme {
  return seminrThemeCreate({
    plotBgcolor: "black",
    plotTitleFontcolor: "white",
    smNodeColor: "white",
    smNodeFill: "darkslategray",
    smNodeLabelFontcolor: "white",
    smEdgeLabelFontcolor: "white",
    smEdgeNegativeColor: "firebrick",
    smEdgePositiveColor: "white",
    mmNodeColor: "lightgray",
    mmNodeFill: "darkgoldenrod4",
    mmNodeLabelFontcolor: "white",
    mmEdgeLabelFontcolor: "lightgray",
    mmEdgePositiveColor: "lightgray",
    mmEdgeNegativeColor: "firebrick",
  });
}

// Active theme (theme_current.R): a module-global mutable slot, as R's
// seminr_global$theme_current environment.
let themeCurrent: SeminrTheme = seminrThemeCreate();

/** Get the active theme applied to every plot (theme_current.R:12). */
export function seminrThemeGet(): SeminrTheme {
  return themeCurrent;
}

/** Set the active theme; returns the previous one (theme_current.R:19). */
export function seminrThemeSet(theme: SeminrTheme): SeminrTheme {
  const old = themeCurrent;
  themeCurrent = theme;
  return old;
}

/** Reset the active theme to the default (test helper; not in R's API). */
export function seminrThemeReset(): SeminrTheme {
  return seminrThemeSet(seminrThemeCreate());
}
