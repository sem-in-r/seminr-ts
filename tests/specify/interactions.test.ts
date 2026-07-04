import { describe, it, expect } from "bun:test";
import {
  interactionTerm,
  quadraticTerm,
  productIndicator,
  orthogonal,
  twoStage,
  type InteractionContext,
} from "../../src/specify/interactions.ts";
import {
  constructs,
  composite,
  multiItems,
  regressionWeights,
} from "../../src/specify/constructs.ts";
import { MmMatrix } from "../../src/model/mmMatrix.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { SmMatrix } from "../../src/model/smMatrix.ts";
import { selectColumns } from "../../src/estimate/data.ts";
import { namedMatrix } from "../../src/math/matrix.ts";
import { adjustInteraction } from "../../src/estimate/simplePls.ts";
import { pathWeighting } from "../../src/estimate/schemes.ts";
import { loadFixture, loadMobi, type FixtureMatrix } from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";

interface M4Fixture {
  interactionItemNames: string[];
  interactionDataHead: FixtureMatrix;
  orthoCoefs?: Record<string, Record<string, number>>;
}

const mobi = await loadMobi();
const productIndicatorFx = await loadFixture<M4Fixture>("M4_interaction_product_indicator");
const orthogonalFx = await loadFixture<M4Fixture>("M4_interaction_orthogonal");
const twoStageFx = await loadFixture<M4Fixture>("M4_interaction_two_stage");

// M4 base model (no interaction entries; the builders receive this context)
const baseMm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Value", multiItems("PERV", [1, 2])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);
const m4Sm = SmMatrix.fromRows(relationships(
  paths(["Image", "Expectation", "Value", "Image*Expectation"], "Satisfaction"),
));
const measuredItems = [
  ...multiItems("IMAG", [1, 2, 3, 4, 5]),
  ...multiItems("CUEX", [1, 2, 3]),
  ...multiItems("PERV", [1, 2]),
  ...multiItems("CUSA", [1, 2, 3]),
];

const ctx: InteractionContext = {
  data: selectColumns(mobi, measuredItems),
  mmMatrix: MmMatrix.fromMeasurementModel(baseMm),
  structuralModel: m4Sm,
  innerWeights: pathWeighting,
};

function expectHeadMatches(actualColumns: Map<string, number[]>, head: FixtureMatrix): void {
  for (const [j, col] of head.cols.entries()) {
    const actual = actualColumns.get(col);
    expect(actual, `column ${col} missing`).toBeDefined();
    for (let i = 0; i < head.rows.length; i++) {
      expect(
        Math.abs(actual![i]! - head.values[i]![j]!),
        `${col} row ${i + 1}`,
      ).toBeLessThan(PARITY_TOLERANCE);
    }
  }
}

function columnsOf(result: { data: { columns: string[]; values: number[][] } }): Map<string, number[]> {
  return new Map(
    result.data.columns.map((c, j) => [c, result.data.values.map((row) => row[j]!)]),
  );
}

describe("productIndicator", () => {
  const fx = productIndicatorFx;

  it("generates scaled pairwise product items named iv*moderator, iv item varying slowest", () => {
    const result = productIndicator("Image", "Expectation")(ctx);
    expect(result.name).toBe("Image*Expectation");
    expect(result.data.columns).toEqual(fx.interactionItemNames);
    expect(result.data.columns[0]).toBe("IMAG1*CUEX1");
    expect(result.mm.every((r) => r.construct === "Image*Expectation" && r.type === "A")).toBe(true);
    expectHeadMatches(columnsOf(result), fx.interactionDataHead);
  });
});

describe("orthogonal", () => {
  const fx = orthogonalFx;

  it("replaces product columns with lm residuals on the unscaled main-effect items", () => {
    const result = orthogonal("Image", "Expectation")(ctx);
    expect(result.data.columns).toEqual(fx.interactionItemNames);
    expectHeadMatches(columnsOf(result), fx.interactionDataHead);
  });

  it("keeps the regression coefficients (incl. intercept) per product item", () => {
    const result = orthogonal("Image", "Expectation")(ctx);
    const expected = fx.orthoCoefs!;
    expect(result.orthoCoefs).toBeDefined();
    for (const [item, coefs] of Object.entries(expected)) {
      for (const [name, value] of Object.entries(coefs)) {
        expect(
          Math.abs(result.orthoCoefs![item]![name]! - value),
          `orthoCoefs[${item}][${name}]`,
        ).toBeLessThan(PARITY_TOLERANCE);
      }
    }
  });
});

describe("twoStage", () => {
  const fx = twoStageFx;

  it("creates a single product column of first-stage construct scores", () => {
    const result = twoStage("Image", "Expectation")(ctx);
    expect(result.data.columns).toEqual(["Image*Expectation_intxn"]);
    expect(result.data.columns).toEqual(fx.interactionItemNames);
    expectHeadMatches(columnsOf(result), fx.interactionDataHead);
  });
});

describe("interactionTerm / quadraticTerm", () => {
  it("builds an interaction spec named iv*moderator", () => {
    const spec = interactionTerm("Image", "Expectation");
    expect(spec.kind).toBe("interaction");
    expect(spec.name).toBe("Image*Expectation");
  });

  it("quadraticTerm is the interaction of a construct with itself", () => {
    const spec = quadraticTerm("Image");
    expect(spec.name).toBe("Image*Image");
  });

  it("quadraticTerm defaults to the two_stage method, as seminr's quadratic_term()", () => {
    expect(quadraticTerm("Image").methodName).toBe("two_stage");
  });

  it("accepts the named form interactionTerm({iv, moderator, method?, weights?})", () => {
    const named = interactionTerm({ iv: "Image", moderator: "Expectation", method: twoStage });
    expect(named.name).toBe("Image*Expectation");
    expect(named.methodName).toBe("two_stage");
    expect(named.weights).toBe("correlation_weights");
  });

  it("accepts the named form quadraticTerm({iv, method?, weights?})", () => {
    const named = quadraticTerm({ iv: "Image", method: productIndicator });
    expect(named.name).toBe("Image*Image");
    expect(named.methodName).toBe("product_indicator");
    expect(quadraticTerm({ iv: "Image" }).methodName).toBe("two_stage");
  });
});

describe("adjustInteraction", () => {
  it("scales interaction scores by the |loading|-weighted mean of raw item SDs", () => {
    const mm = MmMatrix.fromMeasurementModel(
      constructs(composite("A*B", ["p1", "p2"])),
    );
    // raw items p1 (sd 2) and p2 (sd 4); loadings 0.5 and 1
    const obsData = {
      columns: ["p1", "p2"],
      values: [
        [0, 0],
        [2, 4],
        [4, 8],
      ],
    };
    const loadings = namedMatrix(["p1", "p2"], ["A*B"], [[0.5], [1]]);
    const scores = { columns: ["A*B"], values: [[1], [2], [3]] };
    adjustInteraction(["A*B"], mm, loadings, scores, obsData);
    // adjustment = (2*0.5 + 4*1) / (0.5 + 1) = 5 / 1.5
    const factor = 5 / 1.5;
    expect(scores.values.map((r) => r[0])).toEqual([factor, 2 * factor, 3 * factor]);
  });
});
