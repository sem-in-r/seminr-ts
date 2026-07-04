import { describe, it, expect } from "bun:test";
import { estimateCfa } from "../../src/cbsem/estimateCfa.ts";
import { estimateCbsem } from "../../src/cbsem/estimateCbsem.ts";
import {
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { interactionTerm, productIndicator } from "../../src/specify/interactions.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { loadMobi } from "../helpers/fixtures.ts";

const mobi = await loadMobi();

const mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", singleItem("CUEX3")),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);

describe("named-argument call forms", () => {
  it("estimateCfa({data, measurementModel}) equals the positional form", () => {
    const positional = estimateCfa(mobi, mm);
    const named = estimateCfa({ data: mobi, measurementModel: mm });
    expect(named.lavaanModel).toBe(positional.lavaanModel);
    expect(named.factorLoadings).toEqual(positional.factorLoadings);
    expect(named.constructScores.values[0]).toEqual(positional.constructScores.values[0]!);
  });

  it("estimateCbsem({data, measurementModel, structuralModel}) equals the positional form", () => {
    const intxnMm = [
      ...mm,
      interactionTerm({ iv: "Image", moderator: "Expectation", method: productIndicator }),
    ];
    const sm = relationships(
      paths({ from: ["Image", "Expectation", "Value", "Image*Expectation"], to: "Satisfaction" }),
    );
    const positional = estimateCbsem(mobi, intxnMm, sm);
    const named = estimateCbsem({
      data: mobi,
      measurementModel: intxnMm,
      structuralModel: sm,
    });
    expect(named.lavaanModel).toBe(positional.lavaanModel);
    expect(named.pathCoef).toEqual(positional.pathCoef);
  });
});
