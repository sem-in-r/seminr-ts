import { describe, it, expect } from "bun:test";
import { buildParTable } from "../../src/cbsem/partable.ts";
import { sampleCovariance, buildModelMatrices, impliedSigma } from "../../src/cbsem/sigma.ts";
import { mlObjective, mlGradient, startingValues, fitMl } from "../../src/cbsem/mlFit.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { buildMmMatrix } from "../../src/model/mmMatrix.ts";
import { selectColumns } from "../../src/estimate/data.ts";
import { loadFixture, loadMobi, type FixtureMatrix } from "../helpers/fixtures.ts";
import { expectTestthatEqual, fixtureFreeEstimates, type CbsemFixture } from "./helpers.ts";

const c3cfaMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
);
const c3cfaAm = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

const c1Mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Complaints", singleItem("CUSCO")),
);
const c1Am = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

const mobi = await loadMobi();
const c3cfaFx = await loadFixture<CbsemFixture>("cbsem-C3_cfa_doc");
const c1Fx = await loadFixture<CbsemFixture>("cbsem-C1_cfa_demo");

const c3cfaPt = buildParTable({ mmMatrix: buildMmMatrix(c3cfaMm), itemAssociations: c3cfaAm });
const c1Pt = buildParTable({ mmMatrix: buildMmMatrix(c1Mm), itemAssociations: c1Am });

const expectMatrixCloseTo = (actual: number[][], fixture: FixtureMatrix, digits: number) => {
  expect(actual.length).toBe(fixture.values.length);
  for (let i = 0; i < actual.length; i++) {
    for (let j = 0; j < actual[i]!.length; j++) {
      expect(actual[i]![j]!).toBeCloseTo(fixture.values[i]![j]!, digits);
    }
  }
};

describe("sampleCovariance", () => {
  it("uses the N denominator and matches lavaan sampstat cov (C3 doc CFA)", () => {
    const s = sampleCovariance(selectColumns(mobi, c3cfaPt.observed));
    expectMatrixCloseTo(s, c3cfaFx.ml.sampleCov, 10);
  });
});

describe("mlObjective at the fixture optimum", () => {
  it("reproduces lavaan fmin = 0.5*F (C3 doc CFA)", () => {
    const s = sampleCovariance(selectColumns(mobi, c3cfaPt.observed));
    const thetaHat = fixtureFreeEstimates(c3cfaFx.ml.parTable);
    expect(mlObjective(c3cfaPt, s, thetaHat)).toBeCloseTo(c3cfaFx.ml.fitMeasures["fmin"]!, 9);
  });

  it("reproduces lavaan fmin with association-only observed vars (C1)", () => {
    const s = sampleCovariance(selectColumns(mobi, c1Pt.observed));
    const thetaHat = fixtureFreeEstimates(c1Fx.ml.parTable);
    expect(mlObjective(c1Pt, s, thetaHat)).toBeCloseTo(c1Fx.ml.fitMeasures["fmin"]!, 9);
  });

  it("returns +Infinity for a non-PD implied covariance", () => {
    const theta = startingValues(c3cfaPt, sampleCovariance(selectColumns(mobi, c3cfaPt.observed)));
    // zero all residual variances -> singular Sigma for this structure
    const broken = theta.map((v, i) =>
      c3cfaPt.freeParams[i]!.matrix === "theta" ? 0 : v,
    );
    const s = sampleCovariance(selectColumns(mobi, c3cfaPt.observed));
    expect(mlObjective(c3cfaPt, s, broken)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("mlGradient", () => {
  const numericGradient = (
    f: (t: number[]) => number,
    theta: readonly number[],
    h = 1e-6,
  ): number[] =>
    theta.map((_, i) => {
      const up = [...theta];
      const dn = [...theta];
      up[i] = up[i]! + h;
      dn[i] = dn[i]! - h;
      return (f(up) - f(dn)) / (2 * h);
    });

  it("matches central-difference gradients at the starting values (C3 doc CFA)", () => {
    const s = sampleCovariance(selectColumns(mobi, c3cfaPt.observed));
    const theta = startingValues(c3cfaPt, s);
    const analytic = mlGradient(c3cfaPt, s, theta);
    const numeric = numericGradient((t) => mlObjective(c3cfaPt, s, t), theta);
    for (let i = 0; i < theta.length; i++) {
      expect(analytic[i]!).toBeCloseTo(numeric[i]!, 6);
    }
  });

  it("matches numeric gradients away from the optimum (C1, perturbed)", () => {
    const s = sampleCovariance(selectColumns(mobi, c1Pt.observed));
    const theta = fixtureFreeEstimates(c1Fx.ml.parTable).map((v, i) => v + 0.017 * ((i % 3) - 1));
    const analytic = mlGradient(c1Pt, s, theta);
    const numeric = numericGradient((t) => mlObjective(c1Pt, s, t), theta);
    for (let i = 0; i < theta.length; i++) {
      expect(analytic[i]!).toBeCloseTo(numeric[i]!, 6);
    }
  });

  it("vanishes at the lavaan optimum (C3 doc CFA)", () => {
    const s = sampleCovariance(selectColumns(mobi, c3cfaPt.observed));
    const g = mlGradient(c3cfaPt, s, fixtureFreeEstimates(c3cfaFx.ml.parTable));
    for (const gi of g) expect(Math.abs(gi)).toBeLessThan(1e-5);
  });
});

describe("fitMl full-estimation parity", () => {
  const checkFit = (
    pt: ReturnType<typeof buildParTable>,
    fx: CbsemFixture,
  ) => {
    const s = sampleCovariance(selectColumns(mobi, pt.observed));
    const fit = fitMl(pt, s);
    expect(fit.converged).toBe(true);
    expectTestthatEqual(fit.matrices.lambda, fx.ml.unstd.lambda);
    expectTestthatEqual(fit.matrices.theta, fx.ml.unstd.theta);
    expectTestthatEqual(fit.matrices.psi, fx.ml.unstd.psi);
    expect(fit.objective).toBeCloseTo(fx.ml.fitMeasures["fmin"]!, 8);
    // implied Sigma is symmetric PD at the optimum
    const sigma = impliedSigma(fit.matrices);
    expect(sigma[0]![1]!).toBeCloseTo(sigma[1]![0]!, 12);
  };

  it("recovers lavaan's C3 doc-example CFA estimates from a cold start at 1e-5", () => {
    checkFit(c3cfaPt, c3cfaFx);
  });

  it("recovers lavaan's C1 demo CFA estimates (extra observed vars) at 1e-5", () => {
    checkFit(c1Pt, c1Fx);
  });
});

describe("buildModelMatrices", () => {
  it("bakes fixed values: psi diag 1, single-item theta 0", () => {
    const theta = startingValues(c1Pt, sampleCovariance(selectColumns(mobi, c1Pt.observed)));
    const m = buildModelMatrices(c1Pt, theta);
    const li = c1Pt.latents.indexOf("Image");
    expect(m.psi[li]![li]).toBe(1);
    const cuscoIdx = c1Pt.observed.indexOf("CUSCO");
    expect(m.theta[cuscoIdx]![cuscoIdx]).toBe(0);
  });
});
