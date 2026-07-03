/** Demo data loading (Bun). The mobi/ECSI dataset ships as a test fixture. */
import { parseCsv } from "../../src/data/csv.ts";
import type { Dataset } from "../../src/estimate/data.ts";

export const mobiCsvUrl = new URL("../../tests/fixtures/data/mobi.csv", import.meta.url);

export async function loadMobi(): Promise<Dataset> {
  return parseCsv(await Bun.file(mobiCsvUrl).text());
}
