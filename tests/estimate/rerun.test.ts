import { describe, it, expect } from "bun:test";
import { rerun } from "../../src/estimate/rerun.ts";
import { estimatePls, naOmit } from "../../src/estimate/estimatePls.ts";
import { asReflective } from "../../src/specify/reflective.ts";
import {
  constructs,
  composite,
  multiItems,
} from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { loadMobi } from "../helpers/fixtures.ts";
import { m1Model } from "../evaluate/models.ts";

const mobi = await loadMobi();

describe("rerun", () => {
  it("reproduces the original estimates when nothing is overridden", () => {
    const model = m1Model();
    const again = rerun(model);
    expect(again.pathCoef).toEqual(model.pathCoef);
    expect(again.outerLoadings).toEqual(model.outerLoadings);
    expect(again.outerWeights).toEqual(model.outerWeights);
    expect(again.constructScores).toEqual(model.constructScores);
    expect(again.iterations).toBe(model.iterations);
  });

  it("re-estimates with an overridden measurement model (seminr's as.reflective example)", () => {
    const model = m1Model();
    const reflectiveMm = asReflective(model.measurementModel);
    const direct = estimatePls(mobi, reflectiveMm, model.structuralModel);
    const again = rerun(model, { measurementModel: reflectiveMm });
    expect(again.pathCoef).toEqual(direct.pathCoef);
    expect(again.outerLoadings).toEqual(direct.outerLoadings);
  });

  it("carries non-default settings through a rerun", () => {
    const mm = constructs(
      composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    );
    const sm = relationships(paths("Image", "Satisfaction"));
    const withHoles = {
      columns: mobi.columns,
      values: mobi.values.map((row, r) =>
        r === 2 ? row.map((v, c) => (mobi.columns[c] === "IMAG1" ? Number.NaN : v)) : row,
      ),
    };
    const model = estimatePls(withHoles, mm, sm, {
      missing: naOmit,
      maxIt: 150,
      stopCriterion: 5,
    });
    const again = rerun(model);
    expect(again.settings).toEqual(model.settings);
    expect(again.missing).toBe(naOmit);
    expect(again.data.values.length).toBe(model.data.values.length); // naOmit row drop preserved
    expect(again.pathCoef).toEqual(model.pathCoef);
  });
});
