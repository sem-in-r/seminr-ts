import { describe, it, expect } from "bun:test";
import { buildParTable } from "../../src/cbsem/partable.ts";
import { sampleCovariance } from "../../src/cbsem/sigma.ts";
import { fitMl } from "../../src/cbsem/mlFit.ts";
import { fitMeasures } from "../../src/cbsem/fitMeasures.ts";
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

const compute = async (
  fixtureName: string,
  mm: ReturnType<typeof constructs>,
  am?: ReturnType<typeof associations>,
  sm?: ReturnType<typeof relationships>,
) => {
  const fx = await loadFixture<CbsemFixture>(fixtureName);
  const pt = buildParTable({
    mmMatrix: buildMmMatrix(mm),
    structuralModel: sm,
    itemAssociations: am,
  });
  const data = selectColumns(mobi, pt.observed);
  const s = sampleCovariance(data);
  const fit = fitMl(pt, s);
  return { fx, fm: fitMeasures(pt, s, fit, data.values.length) };
};

// [key, digits for toBeCloseTo]
const CHECKS: [string, number][] = [
  ["npar", 10],
  ["fmin", 9],
  ["chisq", 6],
  ["df", 10],
  ["pvalue", 8],
  ["baseline.chisq", 6],
  ["baseline.df", 10],
  ["baseline.pvalue", 10],
  ["cfi", 8],
  ["tli", 8],
  ["logl", 5],
  ["unrestricted.logl", 5],
  ["aic", 5],
  ["bic", 5],
  ["bic2", 5],
  ["ntotal", 10],
  ["rmsea", 7],
  ["rmsea.ci.lower", 6],
  ["rmsea.ci.upper", 6],
  ["rmsea.pvalue", 7],
  ["srmr", 8],
];

describe("fitMeasures", () => {
  it("matches lavaan for the C3 doc CFA", async () => {
    const { fx, fm } = await compute(
      "cbsem-C3_cfa_doc",
      constructs(
        reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
        reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
        reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
      ),
      associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2")),
    );
    for (const [key, digits] of CHECKS) {
      expect(fm[key]!).toBeCloseTo(fx.ml.fitMeasures[key]!, digits);
    }
  });

  it("matches lavaan for the C3 ECSI SEM", async () => {
    const { fx, fm } = await compute(
      "cbsem-C3_ecsi",
      constructs(
        reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
        reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
        reflective("Value", multiItems("PERV", [1, 2])),
        reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
        reflective("Complaints", singleItem("CUSCO")),
        reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
      ),
      associations(itemErrors(["PERQ1", "PERQ2"], "IMAG1")),
      relationships(
        paths({ from: ["Image", "Quality"], to: ["Value", "Satisfaction"] }),
        paths({ from: ["Value", "Satisfaction"], to: ["Complaints", "Loyalty"] }),
        paths({ from: "Complaints", to: "Loyalty" }),
      ),
    );
    for (const [key, digits] of CHECKS) {
      expect(fm[key]!).toBeCloseTo(fx.ml.fitMeasures[key]!, digits);
    }
  });
});
