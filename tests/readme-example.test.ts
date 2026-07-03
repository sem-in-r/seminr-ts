/**
 * The README usage example, verified as a test so the documentation cannot rot.
 * Keep in sync with README.md.
 */
import { describe, it, expect } from "bun:test";
import {
  constructs,
  composite,
  multiItems,
  relationships,
  paths,
  estimatePls,
  bootstrapModel,
  bootstrapModelParallel,
  nmGet,
} from "../src/index.ts";
import { loadMobi } from "./helpers/fixtures.ts";

describe("README usage example", () => {
  it("specifies, estimates, and bootstraps a model", async () => {
    const mobi = await loadMobi(); // README: load your data as { columns, values }

    const measurementModel = constructs(
      composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      composite("Expectation", multiItems("CUEX", [1, 2, 3])),
      composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    );

    const structuralModel = relationships(
      paths(["Image", "Expectation"], "Satisfaction"),
    );

    const model = estimatePls(mobi, measurementModel, structuralModel);
    const imagePath = nmGet(model.pathCoef, "Image", "Satisfaction");
    expect(imagePath).toBeGreaterThan(0.4);
    expect(nmGet(model.rSquared, "Rsq", "Satisfaction")).toBeGreaterThan(0.3);

    const boot = bootstrapModel(model, { nboot: 50, seed: 123 });
    expect(boot.boots).toBe(50);
    const bootSd = nmGet(boot.pathsDescriptives, "Image", "Satisfaction Boot SD");
    expect(bootSd).toBeGreaterThan(0);
    // t-value for the Image -> Satisfaction path
    expect(imagePath / bootSd).toBeGreaterThan(2);

    // README: parallel bootstrap across Web Workers — identical results
    const parallel = await bootstrapModelParallel(model, { nboot: 50, seed: 123 });
    expect(parallel.pathsDescriptives).toEqual(boot.pathsDescriptives);

    // README: named-argument forms are equivalent to the positional ones
    expect(paths({ from: ["Image", "Expectation"], to: "Satisfaction" })).toEqual(structuralModel);
    expect(
      composite({
        constructName: "Image",
        itemNames: multiItems({ itemName: "IMAG", itemNumbers: [1, 2, 3, 4, 5] }),
      }),
    ).toEqual(composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])));
    const namedModel = estimatePls({ data: mobi, measurementModel, structuralModel });
    expect(namedModel.pathCoef).toEqual(model.pathCoef);
    const namedBoot = bootstrapModel({ model, nboot: 50, seed: 123 });
    expect(namedBoot.pathsDescriptives).toEqual(boot.pathsDescriptives);
  });
});
