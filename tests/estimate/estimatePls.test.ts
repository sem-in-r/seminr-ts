import { describe, it, expect } from "bun:test";
import { estimatePls, meanReplacement } from "../../src/estimate/estimatePls.ts";
import {
  constructs,
  composite,
  singleItem,
  regressionWeights,
} from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { tinyData, tinyMm, tinySm } from "./tiny.ts";

describe("meanReplacement", () => {
  it("replaces missing values with the column mean of non-missing values", () => {
    const { data } = meanReplacement({
      columns: ["a", "b"],
      values: [
        [1, 10],
        [null as unknown as number, 20],
        [3, 30],
      ],
    });
    expect(data.values[1]![0]).toBe(2);
    expect(data.values[1]![1]).toBe(20);
  });

  it("warns when more than 5% of a column is missing", () => {
    const values: (number | null)[][] = Array.from({ length: 10 }, (_, i) => [i + 1, i + 1]);
    values[0]![0] = null;
    const { warnings } = meanReplacement({ columns: ["a", "b"], values: values as number[][] });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/10\.0% of data missing for indicator a/);
  });

  it("emits no warning at or below 5%", () => {
    const values: (number | null)[][] = Array.from({ length: 20 }, (_, i) => [i + 1]);
    values[0]![0] = null;
    const { warnings } = meanReplacement({ columns: ["a"], values: values as number[][] });
    expect(warnings).toEqual([]);
  });
});

describe("estimatePls orchestration", () => {
  it("estimates the tiny model end to end (same result as simplePls)", () => {
    const model = estimatePls(tinyData, tinyMm, tinySm);
    expect(model.iterations).toBe(8);
    expect(model.rawdata).toBe(tinyData);
    expect(model.settings.maxIt).toBe(300);
    expect(model.settings.stopCriterion).toBe(7);
  });

  it("treats missingValue markers as missing and mean-replaces them", () => {
    const values = tinyData.values.map((row) => [...row]);
    values[0]![0] = -99;
    const model = estimatePls({ columns: tinyData.columns, values }, tinyMm, tinySm, {
      missingValue: -99,
    });
    // x1 column mean of remaining values (2..6) = 4 replaces the marker
    expect(model.data.values[0]![0]).toBe(4);
  });

  it("rejects single-item mode B constructs", () => {
    const mm = constructs(
      composite("X", ["x1", "x2"]),
      composite("M", singleItem("m1"), regressionWeights),
      composite("Y", ["y1", "y2"]),
    );
    expect(() => estimatePls(tinyData, mm, tinySm)).toThrow(/single item.*mode B/i);
  });

  it("surfaces non-convergence as iterations === maxIt", () => {
    const model = estimatePls(tinyData, tinyMm, tinySm, { maxIt: 2 });
    expect(model.iterations).toBe(2);
  });

  it("accepts the named form estimatePls({data, measurementModel, structuralModel, ...options})", () => {
    const named = estimatePls({
      data: tinyData,
      measurementModel: tinyMm,
      structuralModel: tinySm,
    });
    expect(named).toEqual(estimatePls(tinyData, tinyMm, tinySm));

    const withOptions = estimatePls({
      data: tinyData,
      measurementModel: tinyMm,
      structuralModel: tinySm,
      maxIt: 2,
    });
    expect(withOptions.iterations).toBe(2);
  });
});
