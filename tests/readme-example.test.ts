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
  summarizePls,
  bootstrapModel,
  summarizePlsBoot,
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

    // README: summarizePls assembles the assessment report
    const summary = summarizePls(model);
    expect(nmGet(summary.paths, "Image", "Satisfaction")).toBe(imagePath);
    expect(nmGet(summary.paths, "R^2", "Satisfaction")).toBeGreaterThan(0.3);
    expect(summary.reliability.cols).toEqual(["alpha", "rhoA", "rhoC", "AVE"]);
    expect(summary.validity.htmt.rows).toContain("Satisfaction");
    expect(summary.fSquare.rows).toContain("Image");

    const boot = bootstrapModel(model, { nboot: 50, seed: 123 });
    expect(boot.boots).toBe(50);
    const bootSd = nmGet(boot.pathsDescriptives, "Image", "Satisfaction Boot SD");
    expect(bootSd).toBeGreaterThan(0);
    // t-value for the Image -> Satisfaction path
    expect(imagePath / bootSd).toBeGreaterThan(2);

    // README: summarizePlsBoot reports est./boot mean/SD/t/CI per path
    const bootSummary = summarizePlsBoot(boot);
    expect(bootSummary.bootstrappedPaths.cols).toEqual([
      "Original Est.",
      "Bootstrap Mean",
      "Bootstrap SD",
      "T Stat.",
      "2.5% CI",
      "97.5% CI",
      "Bootstrap P Val",
    ]);
    expect(
      nmGet(bootSummary.bootstrappedPaths, "Image  ->  Satisfaction", "Original Est."),
    ).toBe(imagePath);

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

// Keep in sync with the README "Covariance-based SEM (CBSEM / CFA)" section.
import {
  reflective,
  singleItem,
  associations,
  itemErrors,
  estimateCfa,
  estimateCbsem,
  summarizeCbsem,
} from "../src/index.ts";

describe("README CBSEM example", () => {
  it("estimates the CFA and CBSEM shown in the README", async () => {
    const mobi = await loadMobi();

    const mm = constructs(
      reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
      reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
      reflective("Complaints", singleItem("CUSCO")),
    );
    const am = associations(itemErrors("IMAG1", "CUEX2"));

    const cfa = estimateCfa({ data: mobi, measurementModel: mm, itemAssociations: am });
    expect(cfa.factorLoadings.rows.length).toBeGreaterThan(0);
    expect(cfa.constructScores.columns).toEqual(["Image", "Expectation", "Satisfaction", "Complaints"]);
    expect(cfa.lavaanModel).toContain("Image =~ IMAG1 + IMAG2 + IMAG3 + IMAG4 + IMAG5");

    const sm = relationships(
      paths({ from: ["Image", "Expectation"], to: "Satisfaction" }),
      paths({ from: "Satisfaction", to: "Complaints" }),
    );
    const cbsem = estimateCbsem({
      data: mobi,
      measurementModel: mm,
      structuralModel: sm,
      itemAssociations: am,
    });
    expect(nmGet(cbsem.pathCoef, "Image", "Satisfaction")).toBeGreaterThan(0.3);

    const summary = summarizeCbsem(cbsem);
    expect(summary.fit["cfi"]!).toBeGreaterThan(0.8);
    expect(summary.reliability.cols).toEqual(["rhoC", "AVE"]);
    expect(summary.paths.some((row) => row.op === "~" && row.pvalue !== null)).toBe(true);
  });
});
