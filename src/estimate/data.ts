/** Column-named, row-major numeric data containers used throughout estimation. */

/** Observed data: rows are observations, columns are named variables. */
export interface Dataset {
  columns: string[];
  values: number[][];
}

/** Alias used where the matrix is derived (normalized data, construct scores). */
export type ColumnMatrix = Dataset;

export function columnIndex(m: ColumnMatrix, name: string): number {
  const i = m.columns.indexOf(name);
  if (i === -1) throw new Error(`Unknown column: ${name}`);
  return i;
}

export function getColumn(m: ColumnMatrix, name: string): number[] {
  const j = columnIndex(m, name);
  return m.values.map((row) => row[j]!);
}

/** Subset (and reorder) columns by name. */
export function selectColumns(m: ColumnMatrix, names: readonly string[]): ColumnMatrix {
  const idx = names.map((n) => columnIndex(m, n));
  return {
    columns: [...names],
    values: m.values.map((row) => idx.map((j) => row[j]!)),
  };
}
