/** Helpers to load the R-generated golden fixtures and the mobi dataset (Bun-native IO). */
import { expect } from "bun:test";
import { namedMatrix, type NamedMatrix } from "../../src/math/matrix.ts";
import { parseCsv } from "../../src/data/csv.ts";
import type { Dataset } from "../../src/estimate/data.ts";

const fixturesUrl = (path: string): URL => new URL(`../fixtures/${path}`, import.meta.url);

export interface FixtureMatrix {
  rows: string[];
  cols: string[];
  values: number[][];
}

/**
 * jsonlite's auto_unbox collapses length-1 vectors to scalars; re-box any
 * {rows, cols, values} matrix object so single-row/column matrices stay 2-D.
 */
function normalizeMatrices(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeMatrices);
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("rows" in obj && "cols" in obj && "values" in obj) {
      if (typeof obj["rows"] === "string") obj["rows"] = [obj["rows"]];
      if (typeof obj["cols"] === "string") obj["cols"] = [obj["cols"]];
      let values = obj["values"] as unknown[];
      if (values.length > 0 && typeof values[0] === "number") {
        // whole matrix collapsed: one row per scalar
        obj["values"] = values.map((v) => [v]);
      } else {
        obj["values"] = values.map((row) => (typeof row === "number" ? [row] : row));
      }
      return obj;
    }
    for (const key of Object.keys(obj)) obj[key] = normalizeMatrices(obj[key]);
    return obj;
  }
  return node;
}

export async function loadFixture<T = Record<string, unknown>>(name: string): Promise<T> {
  const text = await Bun.file(fixturesUrl(`expected/${name}.json`)).text();
  return normalizeMatrices(JSON.parse(text)) as T;
}

export function asNamedMatrix(fm: FixtureMatrix): NamedMatrix {
  return namedMatrix(fm.rows, fm.cols, fm.values);
}

let mobiCache: Dataset | undefined;

export async function loadMobi(): Promise<Dataset> {
  if (!mobiCache) {
    mobiCache = parseCsv(await Bun.file(fixturesUrl("data/mobi.csv")).text());
  }
  return mobiCache;
}

/** Assert every cell of a NamedMatrix matches the fixture matrix within tolerance. */
export function expectMatrixClose(
  actual: NamedMatrix,
  expected: FixtureMatrix,
  tolerance: number,
  label: string,
): void {
  expect(actual.rows).toEqual(expected.rows);
  expect(actual.cols).toEqual(expected.cols);
  for (let i = 0; i < expected.rows.length; i++) {
    for (let j = 0; j < expected.cols.length; j++) {
      const a = actual.values[i]![j]!;
      const e = expected.values[i]![j]!;
      if (Math.abs(a - e) > tolerance) {
        throw new Error(
          `${label}[${expected.rows[i]}, ${expected.cols[j]}]: got ${a}, expected ${e} (|diff| > ${tolerance})`,
        );
      }
    }
  }
}
