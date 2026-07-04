import { describe, it, expect } from "bun:test";
import { asReflective, higherReflective } from "../../src/specify/reflective.ts";
import {
  composite,
  constructs,
  multiItems,
  reflective,
  regressionWeights,
  singleItem,
  unitWeights,
  type ConstructSpec,
} from "../../src/specify/constructs.ts";
import { interactionTerm } from "../../src/specify/interactions.ts";

describe("asReflective", () => {
  it("coerces every composite construct type to C", () => {
    const mm = constructs(
      composite("Image", multiItems("IMAG", [1, 2, 3])),
      composite("Value", ["PERV1", "PERV2"], regressionWeights),
      composite("Unit", ["U1"], unitWeights),
      reflective("Loyalty", multiItems("CUSL", [1, 2])),
    );
    const out = asReflective(mm);
    for (const entry of out) {
      expect((entry as ConstructSpec).type).toBe("C");
    }
    // names/items preserved
    expect((out[0] as ConstructSpec).name).toBe("Image");
    expect((out[1] as ConstructSpec).items).toEqual(["PERV1", "PERV2"]);
  });

  it("passes interaction specs through unchanged and does not mutate the input", () => {
    const intxn = interactionTerm("Image", "Expectation");
    const image = composite("Image", ["IMAG1"]);
    const mm = constructs(image, intxn);
    const out = asReflective(mm);
    expect(out[1]).toBe(intxn);
    expect(image.type).toBe("A"); // input untouched
    expect(out).not.toBe(mm);
  });
});

describe("higherReflective", () => {
  it("creates a reflective construct whose items are first-order construct names", () => {
    const hoc = higherReflective("ImageSat", ["Image", "Satisfaction"]);
    expect(hoc.kind).toBe("construct");
    expect(hoc.type).toBe("C");
    expect(hoc.items).toEqual(["Image", "Satisfaction"]);
    expect(hoc.higherOrder).toBe(true);
  });

  it("plain reflective constructs carry no higherOrder tag", () => {
    expect(reflective("Image", singleItem("IMAG1")).higherOrder).toBeUndefined();
  });
});
