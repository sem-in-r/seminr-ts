import { describe, it, expect } from "bun:test";
import {
  composite,
  reflective,
  higherComposite,
  constructs,
  multiItems,
  singleItem,
  correlationWeights,
  regressionWeights,
  unitWeights,
  modeA,
  modeB,
  modePlsc,
  constructSpecs,
  interactionSpecs,
  nonInteractionSpecs,
} from "../../src/specify/constructs.ts";
import { interactionTerm } from "../../src/specify/interactions.ts";

describe("multiItems", () => {
  it("generates numbered item names", () => {
    expect(multiItems("IMAG", [1, 2, 3])).toEqual(["IMAG1", "IMAG2", "IMAG3"]);
  });

  it("supports prefix, mid, and suffix affixes", () => {
    expect(multiItems("item", [0, 1], { prefix: "X_", mid: ".", suffix: "_" })).toEqual([
      "X_item.0_",
      "X_item.1_",
    ]);
  });

  it("accepts the named form multiItems({itemName, itemNumbers, ...affixes})", () => {
    expect(multiItems({ itemName: "IMAG", itemNumbers: [1, 2, 3] })).toEqual(
      multiItems("IMAG", [1, 2, 3]),
    );
    expect(multiItems({ itemName: "item", itemNumbers: [0, 1], mid: "." })).toEqual(
      multiItems("item", [0, 1], { mid: "." }),
    );
  });
});

describe("singleItem", () => {
  it("wraps one item name", () => {
    expect(singleItem("CUSCO")).toEqual(["CUSCO"]);
  });
});

describe("composite", () => {
  it("defaults to correlation weights (type A)", () => {
    const c = composite("Image", multiItems("IMAG", [1, 2]));
    expect(c).toEqual({
      kind: "construct",
      name: "Image",
      items: ["IMAG1", "IMAG2"],
      type: "A",
    });
  });

  it("maps regression weights to type B", () => {
    expect(composite("Value", ["PERV1"], regressionWeights).type).toBe("B");
  });

  it("maps unit weights to type UNIT", () => {
    expect(composite("Value", ["PERV1"], unitWeights).type).toBe("UNIT");
  });

  it("accepts modeA/modeB aliases", () => {
    expect(composite("X", ["x1"], modeA).type).toBe("A");
    expect(composite("X", ["x1"], modeB).type).toBe("B");
    expect(modeA === correlationWeights).toBe(true);
  });

  it("maps modePlsc weights to type C, equal to reflective()", () => {
    const c = composite("Image", multiItems("IMAG", [1, 2]), modePlsc);
    expect(c.type).toBe("C");
    expect(c).toEqual(reflective("Image", multiItems("IMAG", [1, 2])));
  });

  it("accepts the named form composite({constructName, itemNames, weights?})", () => {
    expect(composite({ constructName: "Image", itemNames: ["IMAG1", "IMAG2"] })).toEqual(
      composite("Image", ["IMAG1", "IMAG2"]),
    );
    expect(
      composite({ constructName: "Value", itemNames: ["PERV1"], weights: regressionWeights }),
    ).toEqual(composite("Value", ["PERV1"], regressionWeights));
  });
});

describe("reflective", () => {
  it("produces type C constructs", () => {
    expect(reflective("Image", ["IMAG1", "IMAG2"])).toEqual({
      kind: "construct",
      name: "Image",
      items: ["IMAG1", "IMAG2"],
      type: "C",
    });
  });

  it("accepts the named form reflective({constructName, itemNames})", () => {
    expect(reflective({ constructName: "Image", itemNames: ["IMAG1", "IMAG2"] })).toEqual(
      reflective("Image", ["IMAG1", "IMAG2"]),
    );
  });
});

describe("higherComposite", () => {
  it("defaults to two_stage HOCA with dimension names as items", () => {
    const hoc = higherComposite("Satisfaction", ["Image", "Value"]);
    expect(hoc).toEqual({
      kind: "construct",
      name: "Satisfaction",
      items: ["Image", "Value"],
      type: "HOCA",
      method: "two_stage",
    });
  });

  it("maps regression weights to HOCB", () => {
    expect(higherComposite("S", ["A", "B"], "two_stage", regressionWeights).type).toBe("HOCB");
  });

  it("maps unit weights to UNIT like seminr", () => {
    expect(higherComposite("S", ["A", "B"], "two_stage", unitWeights).type).toBe("UNIT");
  });

  it("accepts the named form higherComposite({constructName, dimensions, method?, weights?})", () => {
    expect(higherComposite({ constructName: "S", dimensions: ["A", "B"] })).toEqual(
      higherComposite("S", ["A", "B"]),
    );
    expect(
      higherComposite({ constructName: "S", dimensions: ["A", "B"], weights: regressionWeights }),
    ).toEqual(higherComposite("S", ["A", "B"], "two_stage", regressionWeights));
  });
});

describe("constructs", () => {
  it("aggregates construct specs into a measurement model list", () => {
    const mm = constructs(
      composite("Image", multiItems("IMAG", [1, 2])),
      reflective("Value", ["PERV1", "PERV2"]),
    );
    expect(mm.length).toBe(2);
    expect(mm[0]!.name).toBe("Image");
    expect(mm[1]).toMatchObject({ type: "C" });
  });
});

describe("measurement-model spec accessors", () => {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2])),
    reflective("Expectation", multiItems("CUEX", [1, 2])),
    interactionTerm("Image", "Expectation"),
  );

  it("constructSpecs returns only construct entries, narrowed", () => {
    const specs = constructSpecs(mm);
    expect(specs.map((s) => s.name)).toEqual(["Image", "Expectation"]);
    expect(specs.every((s) => s.kind === "construct")).toBe(true);
    expect(specs[0]!.items).toEqual(["IMAG1", "IMAG2"]);
  });

  it("interactionSpecs returns only interaction entries, narrowed", () => {
    const specs = interactionSpecs(mm);
    expect(specs.map((s) => s.name)).toEqual(["Image*Expectation"]);
    expect(specs[0]!.iv).toBe("Image");
    expect(specs[0]!.moderator).toBe("Expectation");
  });

  it("nonInteractionSpecs drops interaction entries, as seminr's all_non_interactions", () => {
    expect(nonInteractionSpecs(mm).map((s) => s.name)).toEqual(["Image", "Expectation"]);
  });
});
