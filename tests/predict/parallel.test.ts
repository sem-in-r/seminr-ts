/**
 * Parallel PLSpredict on the Web Worker API. Must produce results identical
 * to the sequential predictPls — workers only change wall-clock.
 */
import { describe, it, expect } from "bun:test";
import { predictPls } from "../../src/predict/predictPls.ts";
import { predictPlsParallel } from "../../src/predict/parallel.ts";
import { predictEA } from "../../src/predict/techniques.ts";
import { m1Model, m4piModel } from "../evaluate/models.ts";

function fixedOrdering(n: number): number[] {
  // deterministic non-trivial permutation
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = (i * 17 + 3) % n;
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

describe("predictPlsParallel", () => {
  it("equals sequential predictPls for k-fold with a fixed ordering", async () => {
    const model = m1Model();
    const n = model.data.values.length;
    const options = { noFolds: 10, ordering: fixedOrdering(n) };
    const sequential = predictPls(model, options);
    const parallel = await predictPlsParallel(model, { ...options, workers: 3 });
    expect(parallel.composites).toEqual(sequential.composites);
    expect(parallel.items).toEqual(sequential.items);
  });

  it("equals sequential predictPls for an interaction model with predict_EA", async () => {
    const model = m4piModel();
    const n = model.data.values.length;
    const options = { noFolds: 5, ordering: fixedOrdering(n), technique: predictEA };
    const sequential = predictPls(model, options);
    const parallel = await predictPlsParallel(model, { ...options, workers: 2 });
    expect(parallel.composites).toEqual(sequential.composites);
    expect(parallel.items).toEqual(sequential.items);
  });
});
