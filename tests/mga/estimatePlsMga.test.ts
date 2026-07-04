import { describe, it, expect } from "bun:test";
import { estimatePlsMga } from "../../src/mga/estimatePlsMga.ts";
import { getColumn } from "../../src/estimate/data.ts";
import { loadFixture, loadMobi } from "../helpers/fixtures.ts";
import { PARITY_TOLERANCE } from "../../src/estimate/constants.ts";
import { m2Model } from "../evaluate/models.ts";

interface MgaFixture {
  settings: { nboot: number; group1N: number; group2N: number; condition: number[][] };
  source: string[][];
  target: string[][];
  estimate: number[][];
  group1Beta: number[][];
  group2Beta: number[][];
  diff: number[][];
  group1BetaMean: number[][];
  group2BetaMean: number[][];
  plsMgaP: number[][];
}

interface MgaIndicesFixture {
  group1: number[][];
  group2: number[][];
}

describe("PLS-MGA parity with seminr (M9, CUEX1 < 8)", () => {
  it("matches group betas, boot means, and Henseler p-values", async () => {
    const fx = await loadFixture<MgaFixture>("M9_mga_ecsi");
    const idx = JSON.parse(
      await Bun.file(new URL("../fixtures/expected/mga_indices.json", import.meta.url)).text(),
    ) as MgaIndicesFixture;

    const mobi = await loadMobi();
    const condition = getColumn(mobi, "CUEX1").map((v) => v < 8);
    expect(condition.filter(Boolean).length).toBe(fx.settings.group1N);

    const mga = estimatePlsMga(m2Model(), condition, {
      nboot: fx.settings.nboot,
      group1Indices: idx.group1.map((row) => row.map((i) => i - 1)),
      group2Indices: idx.group2.map((row) => row.map((i) => i - 1)),
    });

    expect(mga.map((r) => r.source)).toEqual(fx.source[0]!);
    expect(mga.map((r) => r.target)).toEqual(fx.target[0]!);
    const columns: Array<[keyof (typeof mga)[number], number[]]> = [
      ["estimate", fx.estimate[0]!],
      ["group1Beta", fx.group1Beta[0]!],
      ["group2Beta", fx.group2Beta[0]!],
      ["diff", fx.diff[0]!],
      ["group1BetaMean", fx.group1BetaMean[0]!],
      ["group2BetaMean", fx.group2BetaMean[0]!],
      ["plsMgaP", fx.plsMgaP[0]!],
    ];
    for (const [key, expected] of columns) {
      mga.forEach((row, i) => {
        const actual = row[key] as number;
        if (Math.abs(actual - expected[i]!) > PARITY_TOLERANCE) {
          throw new Error(
            `mga[${row.source} -> ${row.target}].${String(key)}: got ${actual}, expected ${expected[i]}`,
          );
        }
      });
    }
  });
});
