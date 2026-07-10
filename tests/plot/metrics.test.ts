/**
 * R-compatible text metrics tests (plot plan 1.2a). Calibration targets come
 * from R's committed DOT snapshots and direct R probes: `strwidth(s, units="in")`
 * on the pdf device equals the plain 12pt Helvetica AFM width sum (units/6000
 * inches); `strheight` is the constant ascent of 'M' (718/6000 in).
 */

import { describe, expect, test } from "bun:test";
import {
  getConstructElementSize,
  getManifestElementSize,
  getMmElementOffset,
  getSmElementOffset,
  strheightInches,
  strwidthInches,
} from "../../src/plot/metrics.ts";
import { rNum } from "../../src/plot/rFormat.ts";
import { seminrThemeCreate } from "../../src/plot/theme.ts";
import { R_COLORS } from "../../src/plot/rColors.ts";

const ECSI_CONSTRUCTS = [
  "Image",
  "Expectation",
  "Quality",
  "Value",
  "Satisfaction",
  "Complaints",
  "Loyalty",
];

describe("string metrics", () => {
  test("strwidth matches R probe values", () => {
    expect(strwidthInches("Expectation")).toBe(5225 / 6000);
    expect(strwidthInches("CUSCO")).toBe(3611 / 6000);
    expect(strwidthInches("Quality*Expectation")).toBe(8726 / 6000);
    expect(strwidthInches("PERQ1*CUEX1")).toBe(7113 / 6000);
  });

  test("strheight is the constant ascent of M", () => {
    expect(strheightInches("Image")).toBe(718 / 6000);
    expect(strheightInches("IMAG1")).toBe(718 / 6000);
    expect(strheightInches("gpqy")).toBe(718 / 6000); // descenders don't matter
  });

  test("empty string has zero width", () => {
    expect(strwidthInches("")).toBe(0);
  });
});

describe("shape offsets", () => {
  test("mm offsets (plot_dot.R:793)", () => {
    expect(getMmElementOffset("box")).toEqual({ width: 0, height: 0.05 });
    expect(getMmElementOffset("rectangle")).toEqual({ width: 0, height: 0.05 });
    expect(getMmElementOffset("ellipse")).toEqual({ width: 0.4, height: 0.4 });
    expect(getMmElementOffset("hexagon")).toEqual({ width: 0.4, height: 0.3 });
  });

  test("sm offsets (plot_dot.R:804)", () => {
    expect(getSmElementOffset("box")).toEqual({ width: 0.2, height: 0.1 });
    expect(getSmElementOffset("rectangle")).toEqual({ width: 0.2, height: 0.1 });
    expect(getSmElementOffset("ellipse")).toEqual({ width: 0.4, height: 0.4 });
    expect(getSmElementOffset("hexagon")).toEqual({ width: 0.4, height: 0.3 });
  });
});

describe("element sizes", () => {
  test("construct element size matches snapshot values", () => {
    // snapshot: sm node width 1.27083333333333, height 1.03933333333333 (= 2x)
    const { width, height } = getConstructElementSize(ECSI_CONSTRUCTS, seminrThemeCreate());
    expect(rNum(width)).toBe("1.27083333333333");
    expect(rNum(height * 2)).toBe("1.03933333333333");
  });

  test("manifest element size matches snapshot values", () => {
    const items = [
      ...[1, 2, 3, 4, 5].map((i) => `IMAG${i}`),
      ...[1, 2, 3].map((i) => `CUEX${i}`),
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => `PERQ${i}`),
      "PERV1",
      "PERV2",
      ...[1, 2, 3].map((i) => `CUSA${i}`),
      "CUSCO",
      ...[1, 2, 3].map((i) => `CUSL${i}`),
    ];
    const { width, height } = getManifestElementSize(items, seminrThemeCreate());
    expect(rNum(width)).toBe("0.601833333333333");
    expect(rNum(height)).toBe("0.169666666666667");
  });
});

describe("R color universe", () => {
  test("contains all 657 grDevices::colors() names", () => {
    expect(R_COLORS.size).toBe(657);
    expect(R_COLORS.has("dimgrey")).toBe(true);
    expect(R_COLORS.has("lightgoldenrodyellow")).toBe(true);
    expect(R_COLORS.has("darkgoldenrod4")).toBe(true);
    expect(R_COLORS.has("not-a-color")).toBe(false);
  });
});
