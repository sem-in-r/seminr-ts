/**
 * The five estimated models matching the M7_evaluation_* fixtures
 * (see scripts/generate-fixtures.R): m1 composite, m2 full ECSI,
 * m3 reflective/PLSc, m4pi product-indicator interaction, m5 HOC two-stage.
 */
import { estimatePls, type PlsModel } from "../../src/estimate/estimatePls.ts";
import {
  constructs,
  composite,
  reflective,
  higherComposite,
  multiItems,
  singleItem,
  regressionWeights,
} from "../../src/specify/constructs.ts";
import {
  interactionTerm,
  productIndicator,
  orthogonal,
  twoStage,
  type InteractionMethod,
} from "../../src/specify/interactions.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { loadMobi } from "../helpers/fixtures.ts";

const mobi = await loadMobi();

const m1Sm = relationships(paths(["Image", "Expectation", "Value"], "Satisfaction"));

export function m1Model(): PlsModel {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Value", multiItems("PERV", [1, 2]), regressionWeights),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  );
  return estimatePls(mobi, mm, m1Sm);
}

export function m2Model(): PlsModel {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
    composite("Value", multiItems("PERV", [1, 2])),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    composite("Complaints", singleItem("CUSCO")),
    composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
  );
  const sm = relationships(
    paths("Image", ["Expectation", "Satisfaction", "Loyalty"]),
    paths("Expectation", ["Quality", "Value", "Satisfaction"]),
    paths("Quality", ["Value", "Satisfaction"]),
    paths("Value", ["Satisfaction"]),
    paths("Satisfaction", ["Complaints", "Loyalty"]),
    paths("Complaints", ["Loyalty"]),
  );
  return estimatePls(mobi, mm, sm);
}

export function m3Model(): PlsModel {
  const mm = constructs(
    reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
    reflective("Value", multiItems("PERV", [1, 2])),
    reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  );
  return estimatePls(mobi, mm, m1Sm);
}

function m4Model(method: InteractionMethod): PlsModel {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Value", multiItems("PERV", [1, 2])),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    interactionTerm("Image", "Expectation", method),
  );
  const sm = relationships(
    paths(["Image", "Expectation", "Value", "Image*Expectation"], "Satisfaction"),
  );
  return estimatePls(mobi, mm, sm);
}

export function m4piModel(): PlsModel {
  return m4Model(productIndicator);
}

export function m4orthoModel(): PlsModel {
  return m4Model(orthogonal);
}

export function m4tsModel(): PlsModel {
  return m4Model(twoStage);
}

export function m5Model(): PlsModel {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
    composite("Value", multiItems("PERV", [1, 2])),
    higherComposite("Satisfaction", ["Image", "Value"]),
    composite("Complaints", singleItem("CUSCO")),
    composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
  );
  const sm = relationships(
    paths(["Expectation", "Quality"], "Satisfaction"),
    paths("Satisfaction", ["Complaints", "Loyalty"]),
  );
  return estimatePls(mobi, mm, sm);
}

export interface EvalModelCase {
  fixture: string;
  model: () => PlsModel;
}

/** One entry per M7 evaluation fixture. */
export const evalModelCases: EvalModelCase[] = [
  { fixture: "M7_evaluation_m1", model: m1Model },
  { fixture: "M7_evaluation_m2", model: m2Model },
  { fixture: "M7_evaluation_m3", model: m3Model },
  { fixture: "M7_evaluation_m4pi", model: m4piModel },
  { fixture: "M7_evaluation_m5", model: m5Model },
];
