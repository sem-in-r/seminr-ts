/**
 * Model specs must be able to cross postMessage (Slice 9: worker bootstrap).
 * Interaction specs carry closures, so serialization maps them to descriptors
 * and rebuilds the closures on the other side.
 */
import { describe, it, expect } from "bun:test";
import {
  serializeMeasurementModel,
  deserializeMeasurementModel,
  innerWeightsName,
  innerWeightsFromName,
} from "../../src/specify/serialize.ts";
import {
  constructs,
  composite,
  reflective,
  multiItems,
  regressionWeights,
} from "../../src/specify/constructs.ts";
import {
  interactionTerm,
  twoStage,
  orthogonal,
  type InteractionMethod,
} from "../../src/specify/interactions.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import { pathWeighting, pathFactorial } from "../../src/estimate/schemes.ts";
import { loadMobi } from "../helpers/fixtures.ts";

const mobi = await loadMobi();

const mm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Value", multiItems("PERV", [1, 2]), regressionWeights),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  interactionTerm("Image", "Expectation", twoStage),
);
const sm = relationships(
  paths(["Image", "Expectation", "Value", "Image*Expectation"], "Satisfaction"),
);

describe("interactionTerm descriptor metadata", () => {
  it("records iv, moderator, methodName, and weights for builtin methods", () => {
    const spec = interactionTerm("Image", "Expectation", orthogonal, regressionWeights);
    expect(spec.iv).toBe("Image");
    expect(spec.moderator).toBe("Expectation");
    expect(spec.methodName).toBe("orthogonal");
    expect(spec.weights).toBe("regression_weights");
  });

  it("defaults to product_indicator with mode A weights", () => {
    const spec = interactionTerm("Image", "Expectation");
    expect(spec.methodName).toBe("product_indicator");
    expect(spec.weights).toBe("correlation_weights");
  });

  it("leaves methodName undefined for custom method closures", () => {
    const custom: InteractionMethod = (iv, moderator) => twoStage(iv, moderator);
    const spec = interactionTerm("Image", "Expectation", custom);
    expect(spec.methodName).toBeUndefined();
  });
});

describe("serializeMeasurementModel", () => {
  it("produces a structured-cloneable value (no functions)", () => {
    const serialized = serializeMeasurementModel(mm);
    expect(structuredClone(serialized)).toEqual(serialized);
  });

  it("passes construct specs through and maps interactions to descriptors", () => {
    const serialized = serializeMeasurementModel(mm);
    expect(serialized[0]).toEqual(composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])));
    expect(serialized[4]).toEqual({
      kind: "interaction",
      name: "Image*Expectation",
      iv: "Image",
      moderator: "Expectation",
      method: "two_stage",
      weights: "correlation_weights",
    });
  });

  it("throws a clear error on interactions built from custom closures", () => {
    const custom: InteractionMethod = (iv, moderator) => twoStage(iv, moderator);
    const customMm = constructs(interactionTerm("Image", "Expectation", custom));
    expect(() => serializeMeasurementModel(customMm)).toThrow(/custom interaction method/i);
  });
});

describe("deserializeMeasurementModel round-trip", () => {
  it("estimates identically to the original measurement model", () => {
    const roundTripped = deserializeMeasurementModel(serializeMeasurementModel(mm));
    const original = estimatePls(mobi, mm, sm);
    const rebuilt = estimatePls(mobi, roundTripped, sm);
    expect(rebuilt.pathCoef).toEqual(original.pathCoef);
    expect(rebuilt.outerLoadings).toEqual(original.outerLoadings);
    expect(rebuilt.outerWeights).toEqual(original.outerWeights);
  });

  it("round-trips reflective constructs (PLSc still applies)", () => {
    const reflectiveMm = constructs(
      reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    );
    const roundTripped = deserializeMeasurementModel(serializeMeasurementModel(reflectiveMm));
    expect(roundTripped).toEqual(reflectiveMm);
  });
});

describe("inner weights scheme names", () => {
  it("maps the builtin schemes to names and back", () => {
    expect(innerWeightsName(pathWeighting)).toBe("path_weighting");
    expect(innerWeightsName(pathFactorial)).toBe("path_factorial");
    expect(innerWeightsFromName("path_weighting")).toBe(pathWeighting);
    expect(innerWeightsFromName("path_factorial")).toBe(pathFactorial);
  });

  it("throws on custom inner-weight functions", () => {
    expect(() => innerWeightsName((...args) => pathWeighting(...args))).toThrow(
      /custom inner-weights/i,
    );
  });
});
