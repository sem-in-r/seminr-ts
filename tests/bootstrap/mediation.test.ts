import { describe, it, expect } from "bun:test";
import { bootstrapModel, type BootModel } from "../../src/bootstrap/bootstrap.ts";
import { specificEffectSignificance, totalIndirectCi } from "../../src/bootstrap/mediation.ts";
import { bootPathsDf } from "../../src/bootstrap/summarize.ts";
import { loadFixture, expectMatrixClose } from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import { m2Model } from "../evaluate/models.ts";

interface SpecificEffectCase {
  from: string;
  through: string[];
  to: string;
  values: number[]; // Original Est. | Bootstrap Mean | Bootstrap SD | T Stat. | 2.5% CI | 97.5% CI | Bootstrap P Val
}

interface MediationFixture {
  specificEffects: Record<string, SpecificEffectCase>;
  totalIndirectCis: Record<string, { from: string; to: string; values: number[] }>;
  bootPathsDf: { rows: string[]; cols: string[]; values: number[][] };
}

interface BootIndicesFixture {
  indices: number[][];
}

async function loadIndices(name: string): Promise<number[][]> {
  const url = new URL(`../fixtures/expected/${name}.json`, import.meta.url);
  const fx = JSON.parse(await Bun.file(url).text()) as BootIndicesFixture;
  return fx.indices.map((row) => row.map((i) => i - 1)); // R indices are 1-based
}

let cachedBoot: BootModel | undefined;
async function m2Boot(): Promise<BootModel> {
  cachedBoot ??= bootstrapModel(m2Model(), {
    nboot: 100,
    indices: await loadIndices("boot_indices_m2"),
  });
  return cachedBoot;
}

function expectEffectClose(
  actual: ReturnType<typeof specificEffectSignificance>,
  expected: SpecificEffectCase,
  label: string,
): void {
  const fields = [
    actual.originalEst,
    actual.bootstrapMean,
    actual.bootstrapSd,
    actual.tStat,
    actual.ciLower,
    actual.ciUpper,
    actual.bootstrapP,
  ];
  fields.forEach((v, i) => {
    expect(Math.abs(v - expected.values[i]!), `${label}[${i}]`).toBeLessThan(PARITY_TOLERANCE);
  });
}

describe("M11 specificEffectSignificance parity (M6b ECSI bootstrap)", () => {
  it("matches the direct Image -> Loyalty effect", async () => {
    const fx = await loadFixture<MediationFixture>("M11_mediation");
    const boot = await m2Boot();
    const res = specificEffectSignificance(boot, { from: "Image", to: "Loyalty" });
    expect(res.path).toBe("Image -> Loyalty");
    expectEffectClose(res, fx.specificEffects.direct!, "direct");
  });

  it("matches serial mediation with 1 to 4 mediators", async () => {
    const fx = await loadFixture<MediationFixture>("M11_mediation");
    const boot = await m2Boot();
    for (const key of ["one", "two", "three", "four"]) {
      const expected = fx.specificEffects[key]!;
      const res = specificEffectSignificance(boot, {
        from: expected.from,
        through: expected.through,
        to: expected.to,
      });
      expect(res.path).toBe([expected.from, ...expected.through, expected.to].join(" -> "));
      expectEffectClose(res, expected, key);
    }
  });

  it("matches total_indirect_ci percentile bounds", async () => {
    const fx = await loadFixture<MediationFixture>("M11_mediation");
    const boot = await m2Boot();
    for (const expected of Object.values(fx.totalIndirectCis)) {
      const ci = totalIndirectCi(boot, { from: expected.from, to: expected.to });
      expect(Math.abs(ci.lower - expected.values[0]!), `${expected.from}->${expected.to} lower`).toBeLessThan(PARITY_TOLERANCE);
      expect(Math.abs(ci.upper - expected.values[1]!), `${expected.from}->${expected.to} upper`).toBeLessThan(PARITY_TOLERANCE);
    }
  });

  it("rejects more than 4 mediators, as seminr", async () => {
    const boot = await m2Boot();
    expect(() =>
      specificEffectSignificance(boot, {
        from: "Image",
        through: ["Expectation", "Quality", "Value", "Satisfaction", "Complaints"],
        to: "Loyalty",
      }),
    ).toThrow(/4 mediating/);
  });
});

describe("M11 bootPathsDf parity", () => {
  it("returns the replication-by-path draw matrix with seminr's labels", async () => {
    const fx = await loadFixture<MediationFixture>("M11_mediation");
    const boot = await m2Boot();
    const bp = bootPathsDf(boot);
    expect(bp.cols).toEqual(fx.bootPathsDf.cols);
    expectMatrixClose(bp, fx.bootPathsDf, PARITY_TOLERANCE, "bootPathsDf");
  });
});
