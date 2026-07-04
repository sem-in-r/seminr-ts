import { describe, it, expect } from "bun:test";
import { csem2seminr, lavaan2seminr } from "../../src/specify/importLavaanSyntax.ts";
import {
  constructs,
  composite,
  reflective,
  multiItems,
  modeB,
} from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import { loadMobi } from "../helpers/fixtures.ts";

// seminr's csem2seminr doc example (import_lavaan_syntax.R:15-27)
const ecsiSyntax = `
# Composite model
 Image <~ IMAG1 + IMAG2 + IMAG3 + IMAG4 + IMAG5
 Expectation <~ CUEX1 + CUEX2 + CUEX3
 Value  <~ PERV1  + PERV2
 Satisfaction <~ CUSA1 + CUSA2 + CUSA3

 # Structural model
 Satisfaction ~ Image + Expectation + Value `;

describe("csem2seminr (lavaan syntax import)", () => {
  it("maps <~ statements to mode B composites, as cSEM convention", () => {
    const model = csem2seminr("Image <~ IMAG1 + IMAG2");
    expect(model.kind).toBe("specified");
    expect(model.measurementModel).toEqual([composite("Image", ["IMAG1", "IMAG2"], modeB)]);
  });

  it("maps =~ statements to reflective constructs", () => {
    const model = csem2seminr("Image =~ IMAG1 + IMAG2 + IMAG3");
    expect(model.measurementModel).toEqual([reflective("Image", ["IMAG1", "IMAG2", "IMAG3"])]);
  });

  it("maps ~ statements to structural paths, one per antecedent", () => {
    const model = csem2seminr(`
      Satisfaction <~ CUSA1
      Satisfaction ~ Image + Value
    `);
    expect(model.structuralModel).toEqual(
      relationships(paths("Image", "Satisfaction"), paths("Value", "Satisfaction")),
    );
  });

  it("handles comments, blank lines, semicolons, and multi-line + continuations", () => {
    const model = csem2seminr(`
      # a comment
      Image <~ IMAG1 + IMAG2 +
               IMAG3   # trailing comment
      Value <~ PERV1; Satisfaction <~ CUSA1
    `);
    expect(model.measurementModel).toEqual([
      composite("Image", ["IMAG1", "IMAG2", "IMAG3"], modeB),
      composite("Value", ["PERV1"], modeB),
      composite("Satisfaction", ["CUSA1"], modeB),
    ]);
  });

  it("merges repeated statements for the same construct, as lavaanify", () => {
    const model = csem2seminr(`
      Image <~ IMAG1
      Image <~ IMAG2
    `);
    expect(model.measurementModel).toEqual([composite("Image", ["IMAG1", "IMAG2"], modeB)]);
  });

  it("rejects statements without a recognized operator and constraint modifiers", () => {
    expect(() => csem2seminr("Image IMAG1 + IMAG2")).toThrow(/operator/);
    expect(() => csem2seminr("Image <~ 1*IMAG1")).toThrow(/constraint/i);
  });

  it("reproduces the directly-specified ECSI model and its estimates", async () => {
    const model = csem2seminr(ecsiSyntax);
    const directMm = constructs(
      composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5]), modeB),
      composite("Expectation", multiItems("CUEX", [1, 2, 3]), modeB),
      composite("Value", multiItems("PERV", [1, 2]), modeB),
      composite("Satisfaction", multiItems("CUSA", [1, 2, 3]), modeB),
    );
    const directSm = relationships(paths(["Image", "Expectation", "Value"], "Satisfaction"));
    expect(model.measurementModel).toEqual(directMm);
    expect(model.structuralModel).toEqual(directSm);

    const mobi = await loadMobi();
    const imported = estimatePls(mobi, model);
    const direct = estimatePls(mobi, directMm, directSm);
    expect(imported.pathCoef).toEqual(direct.pathCoef);
    expect(imported.outerLoadings).toEqual(direct.outerLoadings);
  });

  it("aliases lavaan2seminr", () => {
    expect(lavaan2seminr).toBe(csem2seminr);
  });
});
