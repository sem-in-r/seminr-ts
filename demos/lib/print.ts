/**
 * Plain-text result rendering for the demos. Pure string building — no
 * runtime-specific APIs — so the browser demo reuses it verbatim.
 */
import type { NamedMatrix } from "../../src/math/matrix.ts";

export function heading(title: string): string {
  return `\n== ${title} ==`;
}

/** Render a NamedMatrix as an aligned text table. */
export function formatMatrix(m: NamedMatrix, digits = 3): string {
  const header = ["", ...m.cols];
  const body = m.rows.map((row, i) => [row, ...m.values[i]!.map((v) => v.toFixed(digits))]);
  const table = [header, ...body];
  const widths = header.map((_, j) => Math.max(...table.map((line) => line[j]!.length)));
  return table
    .map((line) => line.map((cell, j) => cell.padStart(widths[j]!)).join("  "))
    .join("\n");
}
