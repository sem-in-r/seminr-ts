/**
 * MLR robust layer parity (plan tasks 1.1a/1.1b): sandwich (robust.huber.white)
 * SEs on parameterEstimates + standardizedSolution, Yuan-Bentler-Mplus scaled
 * chisq, and the .scaled/.robust fit-measure columns — all vs the `mlr` key of
 * the R-generated fixtures.
 */

import { describe, it, expect } from "bun:test";
import { estimateCfa, type CfaModel } from "../../src/cbsem/estimateCfa.ts";
import { estimateCbsem, type CbsemModel } from "../../src/cbsem/estimateCbsem.ts";
import { summarize } from "../../src/cbsem/summarize.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { higherReflective } from "../../src/specify/reflective.ts";
import {
  interactionTerm,
  productIndicator,
  twoStage,
} from "../../src/specify/interactions.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { loadFixture, loadMobi } from "../helpers/fixtures.ts";
import type { CbsemFixture, LavFitFixture } from "./helpers.ts";

const mobi = await loadMobi();

/** Relative closeness for magnitude-style quantities (SEs, scaling factors). */
function expectRelClose(actual: number, expected: number, tol: number): void {
  const denom = Math.max(Math.abs(expected), 1e-12);
  if (Math.abs(actual - expected) / denom >= tol) {
    throw new Error(`|${actual} - ${expected}| / ${denom} >= ${tol}`);
  }
}

// C3 ECSI sits on a flat ridge (plan Q7): the observed-information Hessian and
// casewise scores there are optimum-position-sensitive, bounding robust-SE
// parity at ~4e-4 rel even though well-conditioned models agree to 1e-4 and
// position-insensitive quantities (Gamma, A1, baseline scaling) to 1e-11.
const RIDGE_SE_TOL = 5e-4;

/** Robust parameter-table SEs vs the fixture parTable (free rows only). */
function expectRobustParTableSes(
  model: CfaModel | CbsemModel,
  lav: LavFitFixture,
  seTol = 1e-4,
): void {
  const robust = model.estimation.robust!;
  expect(robust).toBeDefined();
  const pt = lav.parTable;
  for (let i = 0; i < pt.free.length; i++) {
    if (pt.free[i]! > 0) {
      expectRelClose(robust.se[pt.free[i]! - 1]!, pt.se[i]!, seTol);
    }
  }
}

/** Robust solution tables via summarize (estimates + standardized). */
function expectRobustTables(
  model: CfaModel | CbsemModel,
  lav: LavFitFixture,
  seTol = 1e-4,
  pDigits = 5,
): void {
  const summary = summarize(model as CfaModel);
  const pe = lav.parameterEstimates;
  expect(summary.estimates.length).toBe(pe["lhs"]!.length);
  summary.estimates.forEach((row, i) => {
    expect(row.lhs).toBe(pe["lhs"]![i] as string);
    expect(row.rhs).toBe(pe["rhs"]![i] as string);
    expect(row.est).toBeCloseTo(pe["est"]![i] as number, 4);
    if (row.se > 0) {
      expectRelClose(row.se, pe["se"]![i] as number, seTol);
      expect(row.z!).toBeCloseTo(pe["z"]![i] as number, 2);
      expect(row.pvalue!).toBeCloseTo(pe["pvalue"]![i] as number, pDigits);
      // CI-bound error is driven by the SE error, so scale the tolerance by
      // the parameter's magnitude (ridge variances reach |est| ~ 15).
      const ciTol = 2.5 * seTol * Math.max(Math.abs(row.est), row.se, 1);
      expect(Math.abs(row.ciLower! - (pe["ci.lower"]![i] as number))).toBeLessThan(ciTol);
      expect(Math.abs(row.ciUpper! - (pe["ci.upper"]![i] as number))).toBeLessThan(ciTol);
    }
  });

  const ss = lav.standardizedSolution;
  expect(summary.solution.length).toBe(ss["lhs"]!.length);
  summary.solution.forEach((row, i) => {
    expect(row.estStd).toBeCloseTo(ss["est.std"]![i] as number, 4);
    const seFx = ss["se"]![i] as number;
    if (seFx > 0) {
      expectRelClose(row.se, seFx, seTol);
    } else {
      // Fixed rows (e.g. single-item residuals): lavaan reports exactly 0;
      // our delta-method Jacobian leaves numerical dust.
      expect(row.se).toBeLessThan(1e-6);
    }
  });
}

/** All YB-Mplus scaled/robust fit columns vs mlr.fitMeasures. */
function expectRobustFit(
  model: CfaModel | CbsemModel,
  lav: LavFitFixture,
  relTol = 1e-4,
  pDigits = 5,
): void {
  const fit = model.estimation.fitMeasures;
  const fx = lav.fitMeasures;

  // exact-df and probability-like keys: absolute closeness
  expect(fit["df.scaled"]!).toBeCloseTo(fx["df.scaled"]!, 8);
  expect(fit["baseline.df.scaled"]!).toBeCloseTo(fx["baseline.df.scaled"]!, 8);
  for (const key of [
    "pvalue.scaled",
    "baseline.pvalue.scaled",
    "rmsea.pvalue.scaled",
    "rmsea.notclose.pvalue.scaled",
    "rmsea.pvalue.robust",
    "rmsea.notclose.pvalue.robust",
  ]) {
    expect(fit[key]!).toBeCloseTo(fx[key]!, pDigits);
  }

  // magnitude keys: relative closeness
  for (const key of [
    "chisq.scaled",
    "chisq.scaling.factor",
    "baseline.chisq.scaled",
    "baseline.chisq.scaling.factor",
    "scaling.factor.h1",
    "scaling.factor.h0",
    "cfi.scaled",
    "tli.scaled",
    "cfi.robust",
    "tli.robust",
    "nnfi.scaled",
    "rfi.scaled",
    "nfi.scaled",
    "pnfi.scaled",
    "ifi.scaled",
    "rni.scaled",
    "nnfi.robust",
    "rni.robust",
    "rmsea.scaled",
    "rmsea.ci.lower.scaled",
    "rmsea.ci.upper.scaled",
    "rmsea.robust",
    "rmsea.ci.lower.robust",
    "rmsea.ci.upper.robust",
  ]) {
    if (fx[key] === null || Number.isNaN(fx[key]!)) continue;
    expectRelClose(fit[key]!, fx[key]!, relTol);
  }
}

// ---------------------------------------------------------------------------
// model setups (identical to the estimateCbsem/summarize parity tests)
// ---------------------------------------------------------------------------

const c1Mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Complaints", singleItem("CUSCO")),
);
const c1Am = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

const c3CfaMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
);
const c3CfaAm = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

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

const c2Mm = [
  ...c1Mm,
  interactionTerm({ iv: "Image", moderator: "Expectation", method: productIndicator }),
];
const c2Sm = relationships(
  paths({ from: ["Image", "Expectation"], to: ["Value", "Loyalty"] }),
  paths({ from: ["Complaints", "Image*Expectation"], to: "Loyalty" }),
);

const c4PartialMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", singleItem("CUEX3")),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);
const c4Sm = relationships(
  paths({ from: ["Image", "Expectation", "Value", "Image*Expectation"], to: "Satisfaction" }),
);

const c5Mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  higherReflective("ImageSat", ["Image", "Satisfaction"]),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const c5Sm = relationships(
  paths({ from: ["ImageSat", "Satisfaction", "Expectation"], to: "Loyalty" }),
);

// ---------------------------------------------------------------------------

describe("estimator option", () => {
  it("explicit ML produces no robust block or scaled columns", async () => {
    const model = estimateCfa(mobi, c3CfaMm, c3CfaAm, { estimator: "ML" });
    expect(model.estimation.estimator).toBe("ML");
    expect(model.estimation.robust).toBeUndefined();
    expect(model.estimation.fitMeasures["chisq.scaled"]).toBeUndefined();
  });

  it("defaults to MLR like seminr (plan Q1)", async () => {
    const model = estimateCfa(mobi, c3CfaMm, c3CfaAm);
    expect(model.estimation.estimator).toBe("MLR");
    expect(model.estimation.robust).toBeDefined();
    expect(model.estimation.fitMeasures["chisq.scaled"]).toBeDefined();
  });

  it("MLR point estimates equal ML point estimates (C3 doc CFA)", async () => {
    const ml = estimateCfa(mobi, c3CfaMm, c3CfaAm, { estimator: "ML" });
    const mlr = estimateCfa(mobi, c3CfaMm, c3CfaAm, { estimator: "MLR" });
    expect(mlr.estimation.fit.objective).toBeCloseTo(ml.estimation.fit.objective, 10);
    mlr.estimation.fit.theta.forEach((v, i) => {
      expect(v).toBeCloseTo(ml.estimation.fit.theta[i]!, 8);
    });
  });
});

describe("MLR robust SEs (robust.huber.white sandwich)", () => {
  it("C1 demo CFA", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C1_cfa_demo");
    const model = estimateCfa(mobi, c1Mm, c1Am, { estimator: "MLR" });
    expectRobustParTableSes(model, fx.mlr);
    expectRobustTables(model, fx.mlr);
  });

  it("C3 doc CFA", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C3_cfa_doc");
    const model = estimateCfa(mobi, c3CfaMm, c3CfaAm, { estimator: "MLR" });
    expectRobustParTableSes(model, fx.mlr);
    expectRobustTables(model, fx.mlr);
  });

  it("C3 ECSI SEM (ridge tolerance, plan Q2/Q7)", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C3_ecsi");
    const model = estimateCbsem(mobi, c3Mm, c3Sm, c3Am, { estimator: "MLR" });
    expectRobustParTableSes(model, fx.mlr, RIDGE_SE_TOL);
    expectRobustTables(model, fx.mlr, RIDGE_SE_TOL, 3);
  });

  it("C2 product-indicator interaction CBSEM", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C2_demo_pi_interaction");
    const model = estimateCbsem(mobi, c2Mm, c2Sm, c1Am, { estimator: "MLR" });
    expectRobustParTableSes(model, fx.mlr);
  });

  it("C4 two-stage interaction CBSEM", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C4_intxn_2stage");
    const mm = [
      ...c4PartialMm,
      interactionTerm({ iv: "Image", moderator: "Expectation", method: twoStage }),
    ];
    const model = estimateCbsem(mobi, mm, c4Sm, undefined, { estimator: "MLR" });
    expectRobustParTableSes(model, fx.mlr);
  });

  it("C5 higher-order CBSEM", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C5_hoc");
    const model = estimateCbsem(mobi, c5Mm, c5Sm, undefined, { estimator: "MLR" });
    expectRobustParTableSes(model, fx.mlr);
  });
});

describe("MLR scaled/robust fit measures (Yuan-Bentler-Mplus)", () => {
  it("C1 demo CFA", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C1_cfa_demo");
    const model = estimateCfa(mobi, c1Mm, c1Am, { estimator: "MLR" });
    expectRobustFit(model, fx.mlr);
  });

  it("C3 doc CFA", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C3_cfa_doc");
    const model = estimateCfa(mobi, c3CfaMm, c3CfaAm, { estimator: "MLR" });
    expectRobustFit(model, fx.mlr);
  });

  it("C3 ECSI SEM (ridge tolerance, plan Q2/Q7)", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C3_ecsi");
    const model = estimateCbsem(mobi, c3Mm, c3Sm, c3Am, { estimator: "MLR" });
    expectRobustFit(model, fx.mlr, 2e-4, 3);
  });

  it("C2 product-indicator interaction CBSEM", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C2_demo_pi_interaction");
    const model = estimateCbsem(mobi, c2Mm, c2Sm, c1Am, { estimator: "MLR" });
    expectRobustFit(model, fx.mlr);
  });

  it("C4 two-stage interaction CBSEM", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C4_intxn_2stage");
    const mm = [
      ...c4PartialMm,
      interactionTerm({ iv: "Image", moderator: "Expectation", method: twoStage }),
    ];
    const model = estimateCbsem(mobi, mm, c4Sm, undefined, { estimator: "MLR" });
    expectRobustFit(model, fx.mlr);
  });

  it("C5 higher-order CBSEM", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C5_hoc");
    const model = estimateCbsem(mobi, c5Mm, c5Sm, undefined, { estimator: "MLR" });
    expectRobustFit(model, fx.mlr);
  });
});

describe("plain fit measures newly required by the scaled family", () => {
  it("nnfi/rfi/nfi/pnfi/ifi/rni + rmsea extras match ml fixture (C3 ECSI)", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C3_ecsi");
    const model = estimateCbsem(mobi, c3Mm, c3Sm, c3Am, { estimator: "ML" });
    const fit = model.estimation.fitMeasures;
    for (const key of ["nnfi", "rfi", "nfi", "pnfi", "ifi", "rni"]) {
      expectRelClose(fit[key]!, fx.ml.fitMeasures[key]!, 1e-5);
    }
    expect(fit["rmsea.ci.level"]!).toBe(0.9);
    expect(fit["rmsea.close.h0"]!).toBe(0.05);
    expect(fit["rmsea.notclose.h0"]!).toBe(0.08);
    expect(fit["rmsea.notclose.pvalue"]!).toBeCloseTo(
      fx.ml.fitMeasures["rmsea.notclose.pvalue"]!,
      5,
    );
  });
});
