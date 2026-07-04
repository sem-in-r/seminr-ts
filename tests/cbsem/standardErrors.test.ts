import { describe, it, expect } from "bun:test";
import { buildParTable } from "../../src/cbsem/partable.ts";
import { sampleCovariance, buildModelMatrices, impliedSigma } from "../../src/cbsem/sigma.ts";
import { fitMl } from "../../src/cbsem/mlFit.ts";
import {
  deltaMatrix,
  mlStandardErrors,
  parameterEstimatesTable,
  standardizedSolutionTable,
} from "../../src/cbsem/standardErrors.ts";
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
import type { CbsemFixture } from "./helpers.ts";

const mobi = await loadMobi();

const c3cfaMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
);
const c3cfaAm = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));
const c3cfaFx = await loadFixture<CbsemFixture>("cbsem-C3_cfa_doc");
const c3cfaPt = buildParTable({ mmMatrix: buildMmMatrix(c3cfaMm), itemAssociations: c3cfaAm });
const c3cfaData = selectColumns(mobi, c3cfaPt.observed);
const c3cfaS = sampleCovariance(c3cfaData);
const c3cfaFit = fitMl(c3cfaPt, c3cfaS);

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
const c3Fx = await loadFixture<CbsemFixture>("cbsem-C3_ecsi");
const c3Pt = buildParTable({ mmMatrix: buildMmMatrix(c3Mm), structuralModel: c3Sm, itemAssociations: c3Am });
const c3S = sampleCovariance(selectColumns(mobi, c3Pt.observed));
const c3Fit = fitMl(c3Pt, c3S);

const vech = (m: number[][]): number[] => {
  const out: number[] = [];
  for (let j = 0; j < m.length; j++) {
    for (let i = j; i < m.length; i++) out.push(m[i]![j]!);
  }
  return out;
};

describe("deltaMatrix", () => {
  it("matches numeric differentiation of vech(Sigma) (C3 ECSI)", () => {
    const theta = c3Fit.theta;
    const delta = deltaMatrix(c3Pt, c3Fit.matrices);
    const h = 1e-6;
    for (let k = 0; k < theta.length; k++) {
      const up = [...theta];
      const dn = [...theta];
      up[k] = up[k]! + h;
      dn[k] = dn[k]! - h;
      const vUp = vech(impliedSigma(buildModelMatrices(c3Pt, up)));
      const vDn = vech(impliedSigma(buildModelMatrices(c3Pt, dn)));
      const dSigma = vUp.map((v, r) => (v - vDn[r]!) / (2 * h));
      for (let r = 0; r < dSigma.length; r++) {
        expect(delta[r]![k]!).toBeCloseTo(dSigma[r]!, 5);
      }
    }
  });
});

describe("mlStandardErrors", () => {
  it("reproduces lavaan se='standard' for the C3 doc CFA", () => {
    const { se } = mlStandardErrors(c3cfaPt, c3cfaFit.matrices, 250);
    const pt = c3cfaFx.ml.parTable;
    for (let i = 0; i < pt.free.length; i++) {
      if (pt.free[i]! > 0) {
        const ours = se[pt.free[i]! - 1]!;
        expect(Math.abs(ours - pt.se[i]!) / pt.se[i]!).toBeLessThan(1e-4);
      }
    }
  });

  it("reproduces lavaan se='standard' for the C3 ECSI SEM", () => {
    const { se } = mlStandardErrors(c3Pt, c3Fit.matrices, 250);
    const pt = c3Fx.ml.parTable;
    for (let i = 0; i < pt.free.length; i++) {
      if (pt.free[i]! > 0) {
        const ours = se[pt.free[i]! - 1]!;
        expect(Math.abs(ours - pt.se[i]!) / pt.se[i]!).toBeLessThan(1e-4);
      }
    }
  });
});

describe("parameterEstimatesTable", () => {
  it("matches lavaan parameterEstimates rows incl. z/p/ci (C3 doc CFA)", () => {
    const rows = parameterEstimatesTable(c3cfaPt, c3cfaFit, 250);
    const pe = c3cfaFx.ml.parameterEstimates;
    expect(rows.length).toBe(pe["lhs"]!.length);
    rows.forEach((row, i) => {
      expect(row.lhs).toBe(pe["lhs"]![i] as string);
      expect<string>(row.op).toBe(pe["op"]![i] as string);
      expect(row.rhs).toBe(pe["rhs"]![i] as string);
      expect(row.est).toBeCloseTo(pe["est"]![i] as number, 4);
      expect(row.se).toBeCloseTo(pe["se"]![i] as number, 4);
      if (row.se > 0) {
        expect(row.z!).toBeCloseTo(pe["z"]![i] as number, 3);
        expect(row.pvalue!).toBeCloseTo(pe["pvalue"]![i] as number, 5);
        expect(row.ciLower!).toBeCloseTo(pe["ci.lower"]![i] as number, 4);
        expect(row.ciUpper!).toBeCloseTo(pe["ci.upper"]![i] as number, 4);
      }
    });
  });
});

describe("standardizedSolutionTable", () => {
  it("matches lavaan standardizedSolution incl. delta-method SEs (C3 doc CFA)", () => {
    const rows = standardizedSolutionTable(c3cfaPt, c3cfaFit, 250);
    const ss = c3cfaFx.ml.standardizedSolution;
    expect(rows.length).toBe(ss["lhs"]!.length);
    rows.forEach((row, i) => {
      expect(row.lhs).toBe(ss["lhs"]![i] as string);
      expect(row.estStd).toBeCloseTo(ss["est.std"]![i] as number, 4);
      expect(row.se).toBeCloseTo(ss["se"]![i] as number, 4);
      if (row.se > 0) {
        expect(row.ciLower!).toBeCloseTo(ss["ci.lower"]![i] as number, 4);
        expect(row.ciUpper!).toBeCloseTo(ss["ci.upper"]![i] as number, 4);
      }
    });
  });

  it("matches lavaan standardizedSolution for the C3 ECSI SEM regressions", () => {
    const rows = standardizedSolutionTable(c3Pt, c3Fit, 250);
    const ss = c3Fx.ml.standardizedSolution;
    rows.forEach((row, i) => {
      if (row.op === "~") {
        expect(row.estStd).toBeCloseTo(ss["est.std"]![i] as number, 4);
        expect(row.se).toBeCloseTo(ss["se"]![i] as number, 4);
      }
    });
  });
});
