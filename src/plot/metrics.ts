/**
 * R-compatible text metrics for DOT node sizing.
 *
 * R's `graphics::strwidth/strheight(units="in")` on the pdf device (the device
 * seminr's snapshot tests open) resolve to plain 12pt Helvetica AFM metrics
 * regardless of the `font` argument (a face index, not a size): string width is
 * the sum of per-glyph AFM widths x 12pt / 1000 / 72in, and single-line string
 * height is the constant ascent of 'M' (718 AFM units). Verified empirically
 * against R 4.5.3 and seminr's committed DOT snapshots (py plan R1).
 *
 * The width table was generated from R (`strwidth` per codepoint, pdf device)
 * for codepoints 32-126 and 160-255; it is byte-for-byte the Adobe Helvetica
 * AFM table R ships in grDevices. Do not edit by hand.
 */

import type { SeminrTheme } from "./theme.ts";

/** AFM glyph widths (per-mille of em) for 12pt plain Helvetica, by codepoint. */
const HELVETICA_WIDTHS: ReadonlyMap<number, number> = new Map([
  [32, 278],
  [33, 278],
  [34, 355],
  [35, 556],
  [36, 556],
  [37, 889],
  [38, 667],
  [39, 222],
  [40, 333],
  [41, 333],
  [42, 389],
  [43, 584],
  [44, 278],
  [45, 584],
  [46, 278],
  [47, 278],
  [48, 556],
  [49, 556],
  [50, 556],
  [51, 556],
  [52, 556],
  [53, 556],
  [54, 556],
  [55, 556],
  [56, 556],
  [57, 556],
  [58, 278],
  [59, 278],
  [60, 584],
  [61, 584],
  [62, 584],
  [63, 556],
  [64, 1015],
  [65, 667],
  [66, 667],
  [67, 722],
  [68, 722],
  [69, 667],
  [70, 611],
  [71, 778],
  [72, 722],
  [73, 278],
  [74, 500],
  [75, 667],
  [76, 556],
  [77, 833],
  [78, 722],
  [79, 778],
  [80, 667],
  [81, 778],
  [82, 722],
  [83, 667],
  [84, 611],
  [85, 722],
  [86, 667],
  [87, 944],
  [88, 667],
  [89, 667],
  [90, 611],
  [91, 278],
  [92, 278],
  [93, 278],
  [94, 469],
  [95, 556],
  [96, 222],
  [97, 556],
  [98, 556],
  [99, 500],
  [100, 556],
  [101, 556],
  [102, 278],
  [103, 556],
  [104, 556],
  [105, 222],
  [106, 222],
  [107, 500],
  [108, 222],
  [109, 833],
  [110, 556],
  [111, 556],
  [112, 556],
  [113, 556],
  [114, 333],
  [115, 500],
  [116, 278],
  [117, 556],
  [118, 500],
  [119, 722],
  [120, 500],
  [121, 500],
  [122, 500],
  [123, 334],
  [124, 260],
  [125, 334],
  [126, 584],
  [160, 278],
  [161, 333],
  [162, 556],
  [163, 556],
  [164, 556],
  [165, 556],
  [166, 260],
  [167, 556],
  [168, 333],
  [169, 737],
  [170, 370],
  [171, 556],
  [172, 584],
  [173, 333],
  [174, 737],
  [175, 333],
  [176, 400],
  [177, 584],
  [178, 333],
  [179, 333],
  [180, 333],
  [181, 556],
  [182, 537],
  [183, 278],
  [184, 333],
  [185, 333],
  [186, 365],
  [187, 556],
  [188, 834],
  [189, 834],
  [190, 834],
  [191, 611],
  [192, 667],
  [193, 667],
  [194, 667],
  [195, 667],
  [196, 667],
  [197, 667],
  [198, 1000],
  [199, 722],
  [200, 667],
  [201, 667],
  [202, 667],
  [203, 667],
  [204, 278],
  [205, 278],
  [206, 278],
  [207, 278],
  [208, 722],
  [209, 722],
  [210, 778],
  [211, 778],
  [212, 778],
  [213, 778],
  [214, 778],
  [215, 584],
  [216, 778],
  [217, 722],
  [218, 722],
  [219, 722],
  [220, 722],
  [221, 667],
  [222, 667],
  [223, 611],
  [224, 556],
  [225, 556],
  [226, 556],
  [227, 556],
  [228, 556],
  [229, 556],
  [230, 889],
  [231, 500],
  [232, 556],
  [233, 556],
  [234, 556],
  [235, 556],
  [236, 278],
  [237, 278],
  [238, 278],
  [239, 278],
  [240, 556],
  [241, 556],
  [242, 556],
  [243, 556],
  [244, 556],
  [245, 556],
  [246, 556],
  [247, 584],
  [248, 611],
  [249, 556],
  [250, 556],
  [251, 556],
  [252, 556],
  [253, 500],
  [254, 556],
  [255, 500],]);

/** strwidth AFM units -> inches at 12pt: units / 1000 * 12 / 72 */
const UNITS_PER_INCH = 6000;

/** Ascent of 'M' in AFM units - R's GStrHeight for any single-line string. */
const M_ASCENT = 718;

const SPACE_WIDTH = HELVETICA_WIDTHS.get(32)!;

/**
 * String width in inches, as R `strwidth(text, units="in")` (pdf device).
 * Unknown codepoints fall back to the width of a space, mirroring the pdf
 * device's metric fallback for glyphs outside the Latin-1 table.
 */
export function strwidthInches(text: string): number {
  let units = 0;
  for (const ch of text) units += HELVETICA_WIDTHS.get(ch.codePointAt(0)!) ?? SPACE_WIDTH;
  return units / UNITS_PER_INCH;
}

/** Single-line string height in inches, as R `strheight(text, units="in")`. */
export function strheightInches(_text: string): number {
  return M_ASCENT / UNITS_PER_INCH;
}

export interface ElementOffset {
  width: number;
  height: number;
}

/** (width, height) offsets for manifest shapes (plot_dot.R:793). */
export function getMmElementOffset(shape: string): ElementOffset {
  const table: Record<string, ElementOffset> = {
    box: { width: 0.0, height: 0.05 },
    rectangle: { width: 0.0, height: 0.05 },
    ellipse: { width: 0.4, height: 0.4 },
    hexagon: { width: 0.4, height: 0.3 },
  };
  const offset = table[shape];
  if (!offset) throw new Error(`Unknown manifest shape: ${shape}`);
  return offset;
}

/** (width, height) offsets for construct shapes (plot_dot.R:804). */
export function getSmElementOffset(shape: string): ElementOffset {
  const table: Record<string, ElementOffset> = {
    box: { width: 0.2, height: 0.1 },
    rectangle: { width: 0.2, height: 0.1 },
    ellipse: { width: 0.4, height: 0.4 },
    hexagon: { width: 0.4, height: 0.3 },
  };
  const offset = table[shape];
  if (!offset) throw new Error(`Unknown construct shape: ${shape}`);
  return offset;
}

export interface ElementSize {
  width: number;
  height: number;
}

/** Optimal (width, height) for construct nodes (plot_dot.R:701). */
export function getConstructElementSize(
  constructs: readonly string[],
  theme: SeminrTheme,
): ElementSize {
  const offsets = [
    getSmElementOffset(theme.constructReflectiveShape),
    getSmElementOffset(theme.constructCompositeAShape),
    getSmElementOffset(theme.constructCompositeBShape),
  ];
  const widthOffset = Math.max(...offsets.map((o) => o.width));
  const heightOffset = Math.max(...offsets.map((o) => o.height));
  const width = Math.max(...constructs.map(strwidthInches)) + widthOffset;
  const height = Math.max(...constructs.map(strheightInches)) + heightOffset;
  return { width, height };
}

/** Optimal (width, height) for manifest nodes (plot_dot.R:728). */
export function getManifestElementSize(
  mmVariables: readonly string[],
  theme: SeminrTheme,
): ElementSize {
  const offsets = [
    getMmElementOffset(theme.manifestReflectiveShape),
    getMmElementOffset(theme.manifestCompositeAShape),
    getMmElementOffset(theme.manifestCompositeBShape),
  ];
  const widthOffset = Math.max(...offsets.map((o) => o.width));
  const heightOffset = Math.max(...offsets.map((o) => o.height));
  const width = Math.max(...mmVariables.map(strwidthInches)) + widthOffset;
  const height = Math.max(...mmVariables.map(strheightInches)) + heightOffset;
  return { width, height };
}
