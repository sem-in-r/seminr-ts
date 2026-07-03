/**
 * Minimal, runtime-agnostic CSV parsing for numeric datasets (the shape R's
 * `write.csv(..., row.names = FALSE)` produces). Works in Bun and browsers —
 * callers supply the text (`Bun.file(...).text()`, `fetch(...).text()`, ...).
 */

import type { Dataset } from "../estimate/data.ts";

/** Parse comma-separated numeric data with a (possibly quoted) header row. "NA"/empty cells become NaN. */
export function parseCsv(text: string): Dataset {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = lines[0];
  if (header === undefined) throw new Error("Empty CSV: no header row");
  const columns = header.split(",").map((cell) => cell.replaceAll('"', "").trim());

  const values = lines.slice(1).map((line, i) => {
    const cells = line.split(",");
    if (cells.length !== columns.length) {
      throw new Error(`CSV row ${i + 1} has ${cells.length} cells, expected ${columns.length}`);
    }
    return cells.map((cell) => {
      const trimmed = cell.replaceAll('"', "").trim();
      return trimmed === "" || trimmed === "NA" ? Number.NaN : Number(trimmed);
    });
  });

  return { columns, values };
}
