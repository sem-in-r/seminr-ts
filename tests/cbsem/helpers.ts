/** Shared helpers for CBSEM parity tests: fixture shapes + free-parameter extraction. */

import { expect } from "bun:test";
import type { FixtureMatrix } from "../helpers/fixtures.ts";

export interface FixtureParTable {
  id: number[];
  lhs: string[];
  op: string[];
  rhs: string[];
  free: number[];
  ustart: (number | null)[];
  start: number[];
  est: number[];
  se: number[];
}

export interface LavFitFixture {
  N: number;
  nvar: number;
  npar: number;
  df: number;
  iterations: number;
  converged: boolean;
  sampleCov: FixtureMatrix;
  parTable: FixtureParTable;
  unstd: { lambda: FixtureMatrix; theta: FixtureMatrix; psi: FixtureMatrix; beta?: FixtureMatrix };
  std: { lambda: FixtureMatrix; theta: FixtureMatrix; psi: FixtureMatrix; beta?: FixtureMatrix };
  corLv: FixtureMatrix;
  r2?: Record<string, number>;
  parameterEstimates: Record<string, (number | string | null)[]>;
  standardizedSolution: Record<string, (number | string | null)[]>;
  fitMeasures: Record<string, number | null>;
}

export interface CbsemFixture {
  settings: Record<string, unknown>;
  lavaanModel: string;
  mlr: LavFitFixture;
  ml: LavFitFixture;
  factorLoadings: FixtureMatrix;
  tenBerge: { weights: FixtureMatrix; scoresHead: FixtureMatrix; scoresAbsMean: Record<string, number> };
  reliability: FixtureMatrix;
  pathCoef?: FixtureMatrix;
  pathsCoefficients?: FixtureMatrix;
  antecedentVifs?: Record<string, Record<string, number>>;
  interactionItemNames?: string[];
  interactionDataHead?: FixtureMatrix;
  interactionDataAbsMean?: Record<string, number>;
}

/**
 * testthat-style matrix comparison: mean relative difference
 * sum(|a-b|)/sum(|b|) below `tol` (seminr's own expect_equal semantics),
 * plus a per-cell absolute cap that flags localized blowups. lavaan's nlminb
 * stops ~1.5e-5 away from the exact optimum, so exact per-cell 1e-5 absolute
 * comparison against lavaan output is unattainable by construction.
 */
export function expectTestthatEqual(
  actual: number[][],
  fixture: FixtureMatrix,
  tol = 1e-5,
  absCap = 5e-5,
): void {
  expect(actual.length).toBe(fixture.values.length);
  let sumAbsDiff = 0;
  let sumAbsRef = 0;
  for (let i = 0; i < actual.length; i++) {
    expect(actual[i]!.length).toBe(fixture.values[i]!.length);
    for (let j = 0; j < actual[i]!.length; j++) {
      const a = actual[i]![j]!;
      const b = fixture.values[i]![j] as number | string | null;
      if (b === null || b === "NA" || Number.isNaN(b as number)) {
        // R NA cell (e.g. non-existent path in seminr's xtabs) — actual must be NaN.
        expect(Number.isNaN(a)).toBe(true);
        continue;
      }
      if (Math.abs(a - (b as number)) > absCap) {
        throw new Error(
          `cell [${i}][${j}] (${fixture.rows?.[i]}, ${fixture.cols?.[j]}): |${a} - ${b}| > ${absCap}`,
        );
      }
      sumAbsDiff += Math.abs(a - (b as number));
      sumAbsRef += Math.abs(b as number);
    }
  }
  const meanRel = sumAbsRef === 0 ? sumAbsDiff : sumAbsDiff / sumAbsRef;
  expect(meanRel).toBeLessThan(tol);
}

/** The estimated free-parameter vector theta-hat, ordered by lavaan free index. */
export function fixtureFreeEstimates(pt: FixtureParTable): number[] {
  const out: [number, number][] = [];
  for (let i = 0; i < pt.free.length; i++) {
    const free = pt.free[i]!;
    if (free > 0) out.push([free, pt.est[i]!]);
  }
  return out.sort((a, b) => a[0] - b[0]).map(([, est]) => est);
}
