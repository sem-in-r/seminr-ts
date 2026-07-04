import { describe, it, expect } from "bun:test";
import { buildParTable } from "../../src/cbsem/partable.ts";
import { sampleCovariance } from "../../src/cbsem/sigma.ts";
import { fitMl } from "../../src/cbsem/mlFit.ts";
import { standardizedSolution, pathCoefMatrix } from "../../src/cbsem/standardize.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { buildMmMatrix } from "../../src/model/mmMatrix.ts";
import { selectColumns } from "../../src/estimate/data.ts";
import { loadFixture, loadMobi } from "../helpers/fixtures.ts";
import { expectTestthatEqual, type CbsemFixture } from "./helpers.ts";

const c3Mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  reflective("Complaints", singleItem("CUSCO")),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const c3Am = associations(itemErrors(["PERQ1", "PERQ2"], "IMAG1"));
const c3Sm = relationships(
  paths({ from: ["Image", "Quality"], to: ["Value", "Satisfaction"] }),
  paths({ from: ["Value", "Satisfaction"], to: ["Complaints", "Loyalty"] }),
  paths({ from: "Complaints", to: "Loyalty" }),
);

const mobi = await loadMobi();
const fx = await loadFixture<CbsemFixture>("cbsem-C3_ecsi");
const pt = buildParTable({ mmMatrix: buildMmMatrix(c3Mm), structuralModel: c3Sm, itemAssociations: c3Am });
const s = sampleCovariance(selectColumns(mobi, pt.observed));
const fit = fitMl(pt, s);
const std = standardizedSolution(pt, fit.matrices);

// C3 has a genuinely flat ridge (Value/Satisfaction collinearity, curvature
// ~4e-3): with BOTH optimizers at the double-precision floor of an f-based
// line search, pointwise agreement on the ridge parameters is limited to
// ~1.5e-5, so the beta-dominated comparisons run at mean-rel 5e-5 (see plan Q7).
const RIDGE_TOL = 5e-5;

describe("full SEM estimation (C3 ECSI)", () => {
  it("converges and recovers lavaan's unstandardized matrices", () => {
    expect(fit.converged).toBe(true);
    expectTestthatEqual(fit.matrices.lambda, fx.ml.unstd.lambda);
    expectTestthatEqual(fit.matrices.beta!, fx.ml.unstd.beta!, RIDGE_TOL);
    expectTestthatEqual(fit.matrices.psi, fx.ml.unstd.psi, RIDGE_TOL);
    expectTestthatEqual(fit.matrices.theta, fx.ml.unstd.theta);
    expect(fit.objective).toBeCloseTo(fx.ml.fitMeasures["fmin"]!, 8);
  });
});

describe("standardizedSolution (C3 ECSI)", () => {
  it("matches lavaan std.all lambda/beta/psi/theta", () => {
    expectTestthatEqual(std.lambda, fx.ml.std.lambda);
    expectTestthatEqual(std.beta!, fx.ml.std.beta!, RIDGE_TOL);
    expectTestthatEqual(std.psi, fx.ml.std.psi, RIDGE_TOL);
    expectTestthatEqual(std.theta, fx.ml.std.theta);
  });

  it("matches lavaan cor.lv", () => {
    expectTestthatEqual(std.corLv, fx.ml.corLv);
  });

  it("matches lavaan r2 per endogenous construct", () => {
    // lavInspect r2 also covers endogenous indicators; seminr subsets to the
    // structural outcomes, and so do we for latents.
    const r2 = fx.ml.r2!;
    expect(Object.keys(std.r2).sort()).toEqual(
      ["Value", "Satisfaction", "Complaints", "Loyalty"].sort(),
    );
    for (const [name, value] of Object.entries(std.r2)) {
      expect(value).toBeCloseTo(r2[name]!, 5);
    }
  });
});

describe("pathCoefMatrix (C3 ECSI)", () => {
  it("reproduces seminr's antecedents-by-outcomes path_coef", () => {
    const pc = pathCoefMatrix(pt, std, c3Sm);
    expect(pc.rows).toEqual(fx.pathCoef!.rows);
    expect(pc.cols).toEqual(fx.pathCoef!.cols);
    expectTestthatEqual(pc.values, fx.pathCoef!, RIDGE_TOL);
  });
});
