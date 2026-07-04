/**
 * Parallel bootstrap on the Web Worker API (Slice 9). Must produce results
 * identical to the sequential bootstrapModel — workers only change wall-clock.
 */
import { describe, it, expect } from "bun:test";
import { bootstrapModel } from "../../src/bootstrap/bootstrap.ts";
import { bootstrapModelParallel } from "../../src/bootstrap/parallel.ts";
import { defaultResampler } from "../../src/bootstrap/rng.ts";
import { estimatePls, naOmit } from "../../src/estimate/estimatePls.ts";
import {
  constructs,
  composite,
  multiItems,
  regressionWeights,
} from "../../src/specify/constructs.ts";
import { interactionTerm, twoStage } from "../../src/specify/interactions.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { loadMobi } from "../helpers/fixtures.ts";

const mobi = await loadMobi();

const m1Mm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Value", multiItems("PERV", [1, 2]), regressionWeights),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);
const m1Sm = relationships(paths(["Image", "Expectation", "Value"], "Satisfaction"));

function fixedIndices(nboot: number, n: number, seed: number): number[][] {
  const resample = defaultResampler(seed);
  return Array.from({ length: nboot }, (_, i) => resample(n, i));
}

describe("bootstrapModelParallel", () => {
  it("equals the sequential bootstrap given the same injected indices", async () => {
    const model = estimatePls(mobi, m1Mm, m1Sm);
    const indices = fixedIndices(8, mobi.values.length, 42);

    const sequential = bootstrapModel(model, { nboot: 8, indices });
    const parallel = await bootstrapModelParallel(model, { nboot: 8, indices, workers: 3 });

    expect(parallel.boots).toBe(sequential.boots);
    expect(parallel.fails).toBe(sequential.fails);
    expect(parallel.bootPaths).toEqual(sequential.bootPaths);
    expect(parallel.bootLoadings).toEqual(sequential.bootLoadings);
    expect(parallel.bootWeights).toEqual(sequential.bootWeights);
    expect(parallel.bootHtmt).toEqual(sequential.bootHtmt);
    expect(parallel.bootTotalPaths).toEqual(sequential.bootTotalPaths);
    expect(parallel.pathsDescriptives).toEqual(sequential.pathsDescriptives);
    expect(parallel.loadingsDescriptives).toEqual(sequential.loadingsDescriptives);
    expect(parallel.weightsDescriptives).toEqual(sequential.weightsDescriptives);
    expect(parallel.htmtDescriptives).toEqual(sequential.htmtDescriptives);
    expect(parallel.totalPathsDescriptives).toEqual(sequential.totalPathsDescriptives);
  });

  it("carries the naOmit missing strategy across the worker boundary", async () => {
    const values = mobi.values.map((row) => [...row]);
    values[3]![mobi.columns.indexOf("IMAG2")] = Number.NaN;
    const model = estimatePls({ columns: mobi.columns, values }, m1Mm, m1Sm, {
      missing: naOmit,
    });
    const indices = fixedIndices(4, values.length, 11);

    const sequential = bootstrapModel(model, { nboot: 4, indices });
    const parallel = await bootstrapModelParallel(model, { nboot: 4, indices, workers: 2 });
    expect(parallel.bootPaths).toEqual(sequential.bootPaths);
    expect(parallel.pathsDescriptives).toEqual(sequential.pathsDescriptives);
  });

  it("rejects custom missing strategies (not serializable to workers)", async () => {
    const custom: typeof naOmit = (data) => ({ data, warnings: [] });
    const model = estimatePls(mobi, m1Mm, m1Sm, { missing: custom });
    expect(bootstrapModelParallel(model, { nboot: 2, workers: 2 })).rejects.toThrow(
      /worker boundary/,
    );
  });

  it("equals the sequential bootstrap given the same seed", async () => {
    const model = estimatePls(mobi, m1Mm, m1Sm);
    const sequential = bootstrapModel(model, { nboot: 6, seed: 7 });
    const parallel = await bootstrapModelParallel(model, { nboot: 6, seed: 7, workers: 3 });
    expect(parallel.seed).toBe(7);
    expect(parallel.bootPaths).toEqual(sequential.bootPaths);
    expect(parallel.pathsDescriptives).toEqual(sequential.pathsDescriptives);
  });

  it("accepts the named form bootstrapModelParallel({model, ...options})", async () => {
    const model = estimatePls(mobi, m1Mm, m1Sm);
    const indices = fixedIndices(4, mobi.values.length, 42);
    const named = await bootstrapModelParallel({ model, nboot: 4, indices, workers: 2 });
    expect(named.pathsDescriptives).toEqual(
      bootstrapModel(model, { nboot: 4, indices }).pathsDescriptives,
    );
  });

  it("counts failed replications without aborting the run", async () => {
    const model = estimatePls(mobi, m1Mm, m1Sm);
    const indices = fixedIndices(4, mobi.values.length, 1);
    // an all-identical resample has zero variance in every column -> estimation throws
    indices[2] = Array.from({ length: mobi.values.length }, () => 0);

    const parallel = await bootstrapModelParallel(model, { nboot: 4, indices, workers: 2 });
    expect(parallel.fails).toBe(1);
    expect(parallel.boots).toBe(3);
    expect(parallel.bootPaths).toHaveLength(3);
  });

  it("carries interaction models (two-stage) across the worker boundary", async () => {
    const mm = constructs(
      composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      composite("Expectation", multiItems("CUEX", [1, 2, 3])),
      composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
      interactionTerm("Image", "Expectation", twoStage),
    );
    const sm = relationships(
      paths(["Image", "Expectation", "Image*Expectation"], "Satisfaction"),
    );
    const model = estimatePls(mobi, mm, sm);
    const indices = fixedIndices(4, mobi.values.length, 5);

    const sequential = bootstrapModel(model, { nboot: 4, indices });
    const parallel = await bootstrapModelParallel(model, { nboot: 4, indices, workers: 2 });
    expect(parallel.bootPaths).toEqual(sequential.bootPaths);
    expect(parallel.pathsDescriptives).toEqual(sequential.pathsDescriptives);
  });

  it("defaults the worker count when not specified", async () => {
    const model = estimatePls(mobi, m1Mm, m1Sm);
    const indices = fixedIndices(2, mobi.values.length, 9);
    const parallel = await bootstrapModelParallel(model, { nboot: 2, indices });
    expect(parallel.boots).toBe(2);
  });
});
