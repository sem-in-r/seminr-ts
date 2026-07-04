import { describe, it, expect } from "bun:test";
import { specifyModel } from "../../src/specify/specifyModel.ts";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import { estimateCfa } from "../../src/cbsem/estimateCfa.ts";
import { estimateCbsem } from "../../src/cbsem/estimateCbsem.ts";
import { constructs, multiItems, reflective } from "../../src/specify/constructs.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { tinyData, tinyMm, tinySm } from "../estimate/tiny.ts";
import { loadMobi } from "../helpers/fixtures.ts";

const mobi = await loadMobi();
const smallMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const smallSm = relationships(paths("Image", "Loyalty"));
const smallAm = associations(itemErrors("IMAG1", "CUSL1"));

describe("specifyModel", () => {
  it("bundles measurement, structural, and association components, as seminr's specify_model", () => {
    const model = specifyModel(smallMm, smallSm, smallAm);
    expect(model.kind).toBe("specified");
    expect(model.measurementModel).toBe(smallMm);
    expect(model.structuralModel).toBe(smallSm);
    expect(model.itemAssociations).toBe(smallAm);
  });

  it("supports the named-argument form with optional components", () => {
    const model = specifyModel({ measurementModel: smallMm });
    expect(model.kind).toBe("specified");
    expect(model.structuralModel).toBeUndefined();
    expect(model.itemAssociations).toBeUndefined();
  });
});

describe("estimators accept a specified model", () => {
  it("estimatePls(data, model) matches the component-form call", () => {
    const bundled = estimatePls(tinyData, specifyModel(tinyMm, tinySm.toRows()));
    const components = estimatePls(tinyData, tinyMm, tinySm);
    expect(bundled.pathCoef.values).toEqual(components.pathCoef.values);
    expect(bundled.kind).toBe("pls");
  });

  it("estimateCfa(data, model) matches the component-form call", () => {
    const bundled = estimateCfa(mobi, specifyModel(smallMm, undefined, smallAm));
    const components = estimateCfa(mobi, smallMm, smallAm);
    expect(bundled.factorLoadings.values).toEqual(components.factorLoadings.values);
    expect(bundled.lavaanModel).toBe(components.lavaanModel);
  });

  it("estimateCbsem(data, model) matches the component-form call", () => {
    const bundled = estimateCbsem(mobi, specifyModel(smallMm, smallSm, smallAm));
    const components = estimateCbsem(mobi, smallMm, smallSm, smallAm);
    expect(bundled.pathCoef.values).toEqual(components.pathCoef.values);
    expect(bundled.lavaanModel).toBe(components.lavaanModel);
  });

  it("named-arg components override the bundle, as seminr's extract_models", () => {
    const otherSm = relationships(paths("Loyalty", "Image"));
    const overridden = estimateCbsem({
      data: mobi,
      model: specifyModel(smallMm, smallSm),
      structuralModel: otherSm,
    });
    expect(overridden.smMatrix.hasPath("Loyalty", "Image")).toBe(true);
    expect(overridden.smMatrix.hasPath("Image", "Loyalty")).toBe(false);
  });
});
