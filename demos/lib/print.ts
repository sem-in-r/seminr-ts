/**
 * Plain-text result rendering for the demos. Pure string building — no
 * runtime-specific APIs — so the browser demo reuses it verbatim. The
 * formatPls* helpers lay sections out like seminr's print.summary.* methods
 * (report_summary.R), with NA cells printed as "." (R's na.print default).
 */
import {
  namedMatrix,
  type NamedMatrix,
  type PlsSummary,
  type PlsBootSummary,
  type PlsPredictSummary,
  type PlsMgaPath,
} from "semints";

export function heading(title: string): string {
  return `\n== ${title} ==`;
}

/** Render a NamedMatrix as an aligned text table; NaN cells print as `naPrint`. */
export function formatMatrix(m: NamedMatrix, digits = 3, naPrint = "."): string {
  const header = ["", ...m.cols];
  const body = m.rows.map((row, i) => [
    row,
    ...m.values[i]!.map((v) => (Number.isNaN(v) ? naPrint : v.toFixed(digits))),
  ]);
  const table = [header, ...body];
  const widths = header.map((_, j) => Math.max(...table.map((line) => line[j]!.length)));
  return table
    .map((line) => line.map((cell, j) => cell.padStart(widths[j]!)).join("  "))
    .join("\n");
}

function selectCols(m: NamedMatrix, cols: readonly string[]): NamedMatrix {
  const idx = cols.map((c) => m.cols.indexOf(c));
  return namedMatrix(
    m.rows,
    cols,
    m.values.map((row) => idx.map((j) => row[j]!)),
  );
}

/** seminr's print.summary.seminr_model layout: path coefficients + reliability. */
export function formatPlsSummary(summary: PlsSummary, digits = 3): string {
  return [
    "Path Coefficients:",
    formatMatrix(summary.paths, digits),
    "",
    "Reliability:",
    formatMatrix(summary.reliability, digits),
  ].join("\n");
}

const BOOT_ALL_COLS = [
  "Original Est.",
  "Bootstrap Mean",
  "Bootstrap SD",
  "T Stat.",
  "2.5% CI",
  "97.5% CI",
  "Bootstrap P Val",
];

/**
 * seminr's print.summary.boot_seminr_model layout (report_summary.R:95-117),
 * plus the total indirect paths table the summary object carries.
 */
export function formatPlsBootSummary(summary: PlsBootSummary, digits = 3): string {
  const noTStat = BOOT_ALL_COLS.filter((c) => c !== "T Stat.");
  const totalPathCols = ["Original Est.", "Bootstrap Mean", "Bootstrap SD", "2.5% CI", "97.5% CI"];
  const sections = [
    `Bootstrap resamples:  ${summary.nboot}`,
    "",
    "Bootstrapped Structural Paths:",
    formatMatrix(selectCols(summary.bootstrappedPaths, BOOT_ALL_COLS), digits),
    "",
    "Bootstrapped Weights:",
    formatMatrix(selectCols(summary.bootstrappedWeights, BOOT_ALL_COLS), digits),
    "",
    "Bootstrapped Loadings:",
    formatMatrix(selectCols(summary.bootstrappedLoadings, BOOT_ALL_COLS), digits),
    "",
    "Bootstrapped HTMT:",
    formatMatrix(selectCols(summary.bootstrappedHtmt, noTStat), digits),
    "",
    "Bootstrapped Total Paths:",
    formatMatrix(selectCols(summary.bootstrappedTotalPaths, totalPathCols), digits),
    "",
    "Bootstrapped Total Indirect Paths:",
    summary.bootstrappedTotalIndirectPaths
      ? formatMatrix(selectCols(summary.bootstrappedTotalIndirectPaths, totalPathCols), digits)
      : "No indirect effects",
  ];
  return sections.join("\n");
}

/** seminr's print.summary.predict_pls_model layout. */
export function formatPlsPredictSummary(summary: PlsPredictSummary, digits = 3): string {
  return [
    "PLS in-sample metrics:",
    formatMatrix(summary.plsInSample, digits),
    "",
    "PLS out-of-sample metrics:",
    formatMatrix(summary.plsOutOfSample, digits),
    "",
    "LM in-sample metrics:",
    formatMatrix(summary.lmInSample, digits),
    "",
    "LM out-of-sample metrics:",
    formatMatrix(summary.lmOutOfSample, digits),
    "",
    "Construct Level metrics:",
    formatMatrix(summary.constructError, digits),
  ].join("\n");
}

/** seminr's print.seminr_pls_mga layout: from | -> | to | group1 | group2 | p. */
export function formatPlsMga(rows: readonly PlsMgaPath[], digits = 3): string {
  const table = [
    ["from", "", "to", "group1", "group2", "p"],
    ...rows.map((r) => [
      r.source,
      "->",
      r.target,
      r.group1Beta.toFixed(digits),
      r.group2Beta.toFixed(digits),
      r.plsMgaP.toFixed(digits),
    ]),
  ];
  const widths = table[0]!.map((_, j) => Math.max(...table.map((line) => line[j]!.length)));
  const body = table
    .map((line) => line.map((cell, j) => cell.padStart(widths[j]!)).join("  "))
    .join("\n");
  return `PLS-MGA results:\n${body}`;
}
