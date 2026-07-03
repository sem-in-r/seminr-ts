import { describe, it, expect } from "bun:test";
import { bootstrapModel, totalEffects } from "../../src/bootstrap/bootstrap.ts";
import { mulberry32 } from "../../src/bootstrap/rng.ts";
import { estimatePls } from "../../src/estimate/estimatePls.ts";
import { namedMatrix, nmGet } from "../../src/math/matrix.ts";
import { tinyData, tinyMm, tinySm } from "../estimate/tiny.ts";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("yields values in [0, 1)", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("totalEffects", () => {
  it("sums powers of the path matrix (B + B² + …)", () => {
    // X -> M -> Y with direct X -> Y
    const b = namedMatrix(["X", "M", "Y"], ["X", "M", "Y"], [
      [0, 0.5, 0.2],
      [0, 0, 0.4],
      [0, 0, 0],
    ]);
    const total = totalEffects(b);
    expect(nmGet(total, "X", "M")).toBeCloseTo(0.5, 12);
    expect(nmGet(total, "M", "Y")).toBeCloseTo(0.4, 12);
    // direct 0.2 + indirect 0.5*0.4
    expect(nmGet(total, "X", "Y")).toBeCloseTo(0.4, 12);
  });
});

describe("bootstrapModel mechanics (tiny model)", () => {
  const model = estimatePls(tinyData, tinyMm, tinySm);

  it("picks rows per replication from the injected index matrix", () => {
    // 3 replications of identity resampling -> every replication equals the
    // original estimation, so Boot SD is 0 and Boot Mean equals the estimate
    const identity = [0, 1, 2, 3, 4, 5];
    const boot = bootstrapModel(model, { nboot: 3, indices: [identity, identity, identity] });
    expect(boot.boots).toBe(3);
    const est = nmGet(boot.pathsDescriptives, "X", "Y PLS Est.");
    expect(est).toBeCloseTo(nmGet(model.pathCoef, "X", "Y"), 12);
    expect(nmGet(boot.pathsDescriptives, "X", "Y Boot Mean")).toBeCloseTo(est, 12);
    expect(nmGet(boot.pathsDescriptives, "X", "Y Boot SD")).toBeCloseTo(0, 12);
  });

  it("computes descriptives (mean/SD across replications) from the boot arrays", () => {
    const boot = bootstrapModel(model, {
      nboot: 3,
      indices: [
        [0, 1, 2, 3, 4, 5],
        [0, 0, 2, 3, 4, 5],
        [1, 1, 2, 3, 4, 4],
      ],
    });
    const reps = boot.bootPaths.map((rep) => nmGet(rep, "X", "Y"));
    expect(reps.length).toBe(3);
    const mean = (reps[0]! + reps[1]! + reps[2]!) / 3;
    const sd = Math.sqrt(
      reps.reduce((s, v) => s + (v - mean) * (v - mean), 0) / 2,
    );
    expect(nmGet(boot.pathsDescriptives, "X", "Y Boot Mean")).toBeCloseTo(mean, 12);
    expect(nmGet(boot.pathsDescriptives, "X", "Y Boot SD")).toBeCloseTo(sd, 12);
  });

  it("drops failed replications and reports the count", () => {
    // A replication with a constant column cannot be standardized -> fails
    const degenerate = [0, 0, 0, 0, 0, 0];
    const boot = bootstrapModel(model, {
      nboot: 3,
      indices: [[0, 1, 2, 3, 4, 5], degenerate, [1, 1, 2, 3, 4, 4]],
    });
    expect(boot.boots).toBe(2);
    expect(boot.fails).toBe(1);
    expect(boot.bootPaths.length).toBe(2);
  });

  it("is reproducible for a given seed with the default resampler", () => {
    const a = bootstrapModel(model, { nboot: 5, seed: 7 });
    const b = bootstrapModel(model, { nboot: 5, seed: 7 });
    expect(nmGet(a.pathsDescriptives, "X", "Y Boot Mean")).toBe(
      nmGet(b.pathsDescriptives, "X", "Y Boot Mean"),
    );
  });

  it("accepts the named form bootstrapModel({model, ...options})", () => {
    const named = bootstrapModel({ model, nboot: 5, seed: 7 });
    expect(named.pathsDescriptives).toEqual(
      bootstrapModel(model, { nboot: 5, seed: 7 }).pathsDescriptives,
    );
  });
});
