/**
 * R-style number formatting (plot plan 1.1a): `rNum` must reproduce C's
 * `%.15g` (what R's paste0/glue emit for doubles) over every numeric label in
 * the DOT fixtures, plus the fixed<->exponential switchover edge cases; `pvalr`
 * and `psignr` mirror seminr's plot_utils.R helpers.
 */

import { describe, expect, test } from "bun:test";
import { pvalr, psignr, rNum, rRound } from "../../src/plot/rFormat.ts";

describe("rNum (%.15g)", () => {
  test("integers and integer-valued doubles have no decimal point", () => {
    expect(rNum(24)).toBe("24");
    expect(rNum(1)).toBe("1");
    expect(rNum(1000)).toBe("1000");
    expect(rNum(95)).toBe("95");
    expect(rNum(-3)).toBe("-3");
    expect(rNum(0)).toBe("0");
  });

  test("fixture node sizes round-trip at 15 significant digits", () => {
    expect(rNum(1.0393333333333334)).toBe("1.03933333333333");
    expect(rNum(1.2708333333333333)).toBe("1.27083333333333");
    expect(rNum(0.16966666666666666)).toBe("0.169666666666667");
    expect(rNum(0.6018333333333333)).toBe("0.601833333333333");
  });

  test("rounded coefficients strip trailing zeros", () => {
    expect(rNum(0.863)).toBe("0.863");
    expect(rNum(0.15)).toBe("0.15");
    expect(rNum(-0.091)).toBe("-0.091");
    expect(rNum(4.815)).toBe("4.815");
    expect(rNum(0.77)).toBe("0.77");
    expect(rNum(5.31)).toBe("5.31");
    expect(rNum(0.5)).toBe("0.5");
  });

  test("switches to exponential below 1e-4", () => {
    expect(rNum(0.0001)).toBe("0.0001");
    expect(rNum(0.00005)).toBe("5e-05");
    expect(rNum(0.000123)).toBe("0.000123");
    expect(rNum(0.0000123)).toBe("1.23e-05");
    expect(rNum(1e-10)).toBe("1e-10");
  });

  test("switches to exponential at 15 integer digits", () => {
    expect(rNum(999999999999999)).toBe("999999999999999");
    expect(rNum(1e15)).toBe("1e+15");
    expect(rNum(1234567890123456)).toBe("1.23456789012346e+15");
    expect(rNum(1e100)).toBe("1e+100");
  });

  test("exponent has a sign and at least two digits", () => {
    expect(rNum(2.5e-7)).toBe("2.5e-07");
    expect(rNum(3.25e20)).toBe("3.25e+20");
  });

  test("negative zero keeps its sign (as C %g)", () => {
    expect(rNum(-0)).toBe("-0");
  });

  test("more than 15 significant digits round half-to-nearest", () => {
    expect(rNum(0.1)).toBe("0.1");
    expect(rNum(1 / 3)).toBe("0.333333333333333");
    expect(rNum(2 / 3)).toBe("0.666666666666667");
    expect(rNum(Math.PI)).toBe("3.14159265358979");
  });
});

describe("rRound (R round(): exact-decimal half-even)", () => {
  test("plain rounding", () => {
    expect(rRound(0.8634567, 3)).toBe(0.863);
    // 0.0905 is stored just below the tie, so 3 digits give 0.09
    expect(rRound(-0.0905, 3)).toBe(-0.09);
    expect(rRound(1.5, 0)).toBe(2);
    expect(rRound(2.5, 0)).toBe(2);
  });

  test("exact ties go to even", () => {
    expect(rRound(0.0625, 3)).toBe(0.062);
    expect(rRound(0.1875, 3)).toBe(0.188);
    expect(rRound(-0.0625, 3)).toBe(-0.062);
  });

  test("inexact representations round by true value, not appearance", () => {
    // 2.675 is stored as 2.67499999999999982..., so 2 digits give 2.67
    expect(rRound(2.675, 2)).toBe(2.67);
  });

  test("non-finite values pass through", () => {
    expect(rRound(Number.NaN, 3)).toBeNaN();
    expect(rRound(Number.POSITIVE_INFINITY, 3)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("pvalr (plot_utils.R:28)", () => {
  test("below the significance floor renders < limit", () => {
    expect(pvalr(0.0001)).toBe("< 0.001");
    expect(pvalr(0.0001, { html: true })).toBe("&lt; 0.001");
  });

  test("two digits above .10, full digits below", () => {
    expect(pvalr(0.45)).toBe("= 0.45");
    expect(pvalr(0.104)).toBe("= 0.10");
    expect(pvalr(0.05)).toBe("= 0.050");
    expect(pvalr(0.0123)).toBe("= 0.012");
  });

  test("negative-zero result normalizes", () => {
    expect(pvalr(0.001)).toBe("= 0.001");
  });
});

describe("psignr (plot_utils.R:61)", () => {
  test("stars per significance limit", () => {
    expect(psignr(0.2)).toBe("");
    expect(psignr(0.04)).toBe("*");
    expect(psignr(0.009)).toBe("**");
    expect(psignr(0.0009)).toBe("***");
  });

  test("NaN renders empty", () => {
    expect(psignr(Number.NaN)).toBe("");
  });
});
