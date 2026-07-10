/**
 * Plotting theme system tests (plot plan 1.3a), ported from seminr's
 * `theme.R` / `theme_defaults.R` / `theme_current.R` via the py port's
 * test_theme.py. R's dotted option names become camelCase options.
 */

import { describe, expect, test } from "bun:test";
import {
  edgeTemplateDefault,
  edgeTemplateMinimal,
  nodeEndoTemplateDefault,
  nodeExoTemplateDefault,
  seminrThemeAcademic,
  seminrThemeCreate,
  seminrThemeDark,
  seminrThemeDefault,
  seminrThemeGet,
  seminrThemeReset,
  seminrThemeSet,
  seminrThemeSmart,
  type SeminrThemeOptions,
} from "../../src/plot/theme.ts";

describe("theme defaults", () => {
  test("default theme matches R defaults", () => {
    const thm = seminrThemeCreate();
    expect(thm.plotTitle).toBe("");
    expect(thm.plotTitleFontsize).toBe(24);
    expect(thm.plotTitleFontcolor).toBe("black");
    expect(thm.plotFontname).toBe("helvetica");
    expect(thm.plotSplines).toBe(true);
    expect(thm.plotRounding).toBe(3);
    expect(thm.plotAdj).toBe(false);
    expect(thm.plotSpecialcharacters).toBe(true);
    expect(thm.plotRandomizedweights).toBe(false);
    expect(thm.plotBgcolor).toBe("transparent");
    expect(thm.mmNodeColor).toBe("dimgrey");
    expect(thm.mmNodeFill).toBe("white");
    expect(thm.mmNodeLabelFontsize).toBe(8);
    expect(thm.mmNodeLabelFontcolor).toBe("black");
    expect(thm.mmNodeHeight).toBe(1);
    expect(thm.mmNodeWidth).toBe(1);
    expect(thm.mmEdgePositiveColor).toBe("dimgrey");
    expect(thm.mmEdgeNegativeColor).toBe("dimgrey");
    expect(thm.mmEdgePositiveStyle).toBe("solid");
    expect(thm.mmEdgeNegativeStyle).toBe("dashed");
    expect(thm.mmEdgeLabelFontsize).toBe(7);
    expect(thm.mmEdgeLabelFontcolor).toBe("black");
    expect(thm.mmEdgeLabelShow).toBe(true);
    expect(thm.mmEdgeMinlen).toBe(1);
    expect(thm.mmEdgeWidthMultiplier).toBe(3);
    expect(thm.mmEdgeWidthOffset).toBe(0.5);
    expect(thm.mmEdgeUseOuterWeights).toBe(true);
    expect(thm.mmEdgeBootShowTValue).toBe(false);
    expect(thm.mmEdgeBootShowPValue).toBe(false);
    expect(thm.mmEdgeBootShowPStars).toBe(true);
    expect(thm.mmEdgeBootShowCi).toBe(false);
    expect(thm.mmEdgeBootTemplate).toBe(edgeTemplateMinimal());
    expect(thm.smNodeColor).toBe("black");
    expect(thm.smNodeFill).toBe("white");
    expect(thm.smNodeLabelFontsize).toBe(12);
    expect(thm.smNodeLabelFontcolor).toBe("black");
    expect(thm.smNodeHeight).toBe(1);
    expect(thm.smNodeWidth).toBe(1);
    expect(thm.smNodeEndoTemplate).toBe(nodeEndoTemplateDefault());
    expect(thm.smNodeExoTemplate).toBe(nodeExoTemplateDefault());
    expect(thm.smEdgePositiveColor).toBe("black");
    expect(thm.smEdgeNegativeColor).toBe("black");
    expect(thm.smEdgePositiveStyle).toBe("solid");
    expect(thm.smEdgeNegativeStyle).toBe("dashed");
    expect(thm.smEdgeLabelFontsize).toBe(9);
    expect(thm.smEdgeLabelFontcolor).toBe("black");
    expect(thm.smEdgeLabelShow).toBe(true);
    expect(thm.smEdgeLabelAllBetas).toBe(true);
    expect(thm.smEdgeBootShowTValue).toBe(false);
    expect(thm.smEdgeBootShowPValue).toBe(false);
    expect(thm.smEdgeBootShowPStars).toBe(true);
    expect(thm.smEdgeBootShowCi).toBe(true);
    expect(thm.smEdgeBootTemplate).toBe(edgeTemplateDefault());
    expect(thm.smEdgeMinlen).toBeNull(); // R: NA_integer_
    expect(thm.smEdgeWidthOffset).toBe(0.5);
    expect(thm.smEdgeWidthMultiplier).toBe(5);
    expect(thm.constructReflectiveShape).toBe("ellipse");
    expect(thm.constructReflectiveArrow).toBe("backward");
    expect(thm.constructReflectiveUseWeights).toBe(false);
    expect(thm.constructCompositeAShape).toBe("hexagon");
    expect(thm.constructCompositeAArrow).toBe("backward");
    expect(thm.constructCompositeAUseWeights).toBe(false);
    expect(thm.constructCompositeBShape).toBe("hexagon");
    expect(thm.constructCompositeBArrow).toBe("forward");
    expect(thm.constructCompositeBUseWeights).toBe(true);
    expect(thm.manifestReflectiveShape).toBe("box");
    expect(thm.manifestCompositeAShape).toBe("box");
    expect(thm.manifestCompositeBShape).toBe("box");
  });

  test("templates match R", () => {
    expect(nodeEndoTemplateDefault()).toBe(
      "<B>{name} </B><BR /><FONT POINT-SIZE='10'>{rstring}</FONT>",
    );
    expect(nodeExoTemplateDefault()).toBe("<B>{name} </B>");
    expect(edgeTemplateDefault()).toBe(
      "{variable} = {value}{stars}<BR /><FONT POINT-SIZE='7'>{civalue} {tvalue} {pvalue} </FONT>",
    );
    expect(edgeTemplateMinimal()).toBe("{variable} = {value}{stars}");
  });
});

describe("theme validation", () => {
  test("bad arrow direction throws", () => {
    expect(() =>
      seminrThemeCreate({ constructReflectiveArrow: "sideways" as never }),
    ).toThrow("forward, backward, none");
  });

  test("illegal color throws", () => {
    expect(() => seminrThemeCreate({ smNodeFill: "not-a-color" })).toThrow(
      "Illegal color-value",
    );
  });

  test("hex color is illegal like R (names only)", () => {
    expect(() => seminrThemeCreate({ mmNodeColor: "#ff0000" })).toThrow(
      "Illegal color-value",
    );
  });

  test("non-numeric fontsize throws", () => {
    expect(() =>
      seminrThemeCreate({ plotTitleFontsize: "big" as never }),
    ).toThrow("font sizes must be numeric");
  });

  test("non-logical splines throws", () => {
    expect(() => seminrThemeCreate({ plotSplines: "yes" as never })).toThrow(
      "plotSplines must be logical",
    );
  });

  test("fontname with space gets quoted", () => {
    expect(seminrThemeCreate({ plotFontname: "Comic Sans" }).plotFontname).toBe(
      "'Comic Sans'",
    );
  });

  test("unused option warns but does not throw", () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      seminrThemeCreate({ plotTypoOption: 1 } as SeminrThemeOptions);
    } finally {
      console.warn = original;
    }
    expect(warnings.join("\n")).toContain("unused or ignored");
  });

  test("smEdgeWidthOffset argument is ignored like R (theme.R:249)", () => {
    expect(seminrThemeCreate({ smEdgeWidthOffset: 2.0 }).smEdgeWidthOffset).toBe(0.5);
  });
});

describe("theme variants", () => {
  test("default variant equals create", () => {
    expect(seminrThemeDefault()).toEqual(seminrThemeCreate());
  });

  test("academic is all ellipse and box", () => {
    const thm = seminrThemeAcademic();
    expect(thm.constructReflectiveShape).toBe("ellipse");
    expect(thm.constructCompositeAShape).toBe("ellipse");
    expect(thm.constructCompositeBShape).toBe("ellipse");
    expect(thm.manifestReflectiveShape).toBe("box");
    expect(thm.manifestCompositeAShape).toBe("box");
    expect(thm.manifestCompositeBShape).toBe("box");
    expect(thm.constructCompositeBArrow).toBe("forward");
  });

  test("smart fills", () => {
    const thm = seminrThemeSmart();
    expect(thm.smNodeFill).toBe("lightcyan");
    expect(thm.mmNodeFill).toBe("lightgoldenrodyellow");
  });

  test("dark colors", () => {
    const thm = seminrThemeDark();
    expect(thm.plotBgcolor).toBe("black");
    expect(thm.plotTitleFontcolor).toBe("white");
    expect(thm.smNodeColor).toBe("white");
    expect(thm.smNodeFill).toBe("darkslategray");
    expect(thm.smEdgeNegativeColor).toBe("firebrick");
    expect(thm.mmNodeFill).toBe("darkgoldenrod4");
    expect(thm.mmEdgePositiveColor).toBe("lightgray");
  });
});

describe("active theme (theme_current.R)", () => {
  test("set returns the previous theme; get returns the active one", () => {
    const original = seminrThemeGet();
    try {
      const dark = seminrThemeDark();
      const old = seminrThemeSet(dark);
      expect(old).toEqual(original);
      expect(seminrThemeGet()).toBe(dark);
    } finally {
      seminrThemeSet(original);
    }
  });

  test("reset restores the default theme", () => {
    seminrThemeSet(seminrThemeDark());
    seminrThemeReset();
    expect(seminrThemeGet()).toEqual(seminrThemeCreate());
  });
});
