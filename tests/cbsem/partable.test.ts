import { describe, it, expect } from "bun:test";
import { buildParTable } from "../../src/cbsem/partable.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { SmMatrix } from "../../src/model/smMatrix.ts";
import { MmMatrix } from "../../src/model/mmMatrix.ts";
import { loadFixture } from "../helpers/fixtures.ts";
import type { CbsemFixture } from "./helpers.ts";

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

const c3Mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  reflective("Complaints", singleItem("CUSCO")),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const c3Am = associations(itemErrors(["PERQ1", "PERQ2"], "IMAG1"));
const c3Sm = SmMatrix.fromRows(relationships(
  paths({ from: ["Image", "Quality"], to: ["Value", "Satisfaction"] }),
  paths({ from: ["Value", "Satisfaction"], to: ["Complaints", "Loyalty"] }),
  paths({ from: "Complaints", to: "Loyalty" }),
));

function fixtureTuples(fx: CbsemFixture): [string, string, string, number][] {
  const pt = fx.ml.parTable;
  return pt.lhs.map((lhs, i) => [lhs, pt.op[i]!, pt.rhs[i]!, pt.free[i]!]);
}

describe("buildParTable", () => {
  it("matches lavaan's flat table for the C3 doc-example CFA (rows, order, free indices)", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C3_cfa_doc");
    const pt = buildParTable({ mmMatrix: MmMatrix.fromMeasurementModel(c3cfaMm), itemAssociations: c3cfaAm });
    expect(pt.rows.map((r) => [r.lhs, r.op, r.rhs, r.free])).toEqual(fixtureTuples(fx));
    expect(pt.latents).toEqual(fx.ml.unstd.lambda.cols);
    expect(pt.observed).toEqual(fx.ml.unstd.lambda.rows);
    expect(pt.freeParams.length).toBe(fx.ml.npar);
  });

  it("handles association-only observed variables (C1 demo CFA)", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C1_cfa_demo");
    const pt = buildParTable({ mmMatrix: MmMatrix.fromMeasurementModel(c1Mm), itemAssociations: c1Am });
    expect(pt.rows.map((r) => [r.lhs, r.op, r.rhs, r.free])).toEqual(fixtureTuples(fx));
    // PERQ1/PERQ2 join as observed variables at the end
    expect(pt.observed).toEqual(fx.ml.unstd.lambda.rows);
    expect(pt.observed.slice(-2)).toEqual(["PERQ1", "PERQ2"]);
    expect(pt.freeParams.length).toBe(fx.ml.npar);
  });

  it("frees only exogenous latent covariances in a full SEM (C3 ECSI)", async () => {
    const fx = await loadFixture<CbsemFixture>("cbsem-C3_ecsi");
    const pt = buildParTable({
      mmMatrix: MmMatrix.fromMeasurementModel(c3Mm),
      structuralModel: c3Sm,
      itemAssociations: c3Am,
    });
    expect(pt.rows.map((r) => [r.lhs, r.op, r.rhs, r.free])).toEqual(fixtureTuples(fx));
    expect(pt.freeParams.length).toBe(fx.ml.npar); // 53: one free psi off-diagonal (Image~~Quality)
    const psiOffDiag = pt.rows.filter((r) => r.op === "~~" && pt.latents.includes(r.lhs) && r.lhs !== r.rhs);
    expect(psiOffDiag).toEqual([{ id: 60, lhs: "Image", op: "~~", rhs: "Quality", free: 53 }]);
  });
});
