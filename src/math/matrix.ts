/** Row-major matrix primitives and name-addressable matrix wrapper. */

export type Matrix = number[][];

export function zeros(nrow: number, ncol: number): Matrix {
  return Array.from({ length: nrow }, () => new Array<number>(ncol).fill(0));
}

export function matmul(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): Matrix {
  const n = a.length;
  const k = b.length;
  const m = b[0]!.length;
  const out = zeros(n, m);
  for (let i = 0; i < n; i++) {
    const ai = a[i]!;
    const oi = out[i]!;
    for (let p = 0; p < k; p++) {
      const aip = ai[p]!;
      if (aip === 0) continue;
      const bp = b[p]!;
      for (let j = 0; j < m; j++) oi[j] = oi[j]! + aip * bp[j]!;
    }
  }
  return out;
}

export function transpose(a: readonly (readonly number[])[]): Matrix {
  const n = a.length;
  const m = a[0]!.length;
  const out = zeros(m, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) out[j]![i] = a[i]![j]!;
  }
  return out;
}

/** A matrix with named rows and columns (mirrors R's dimnames). */
export interface NamedMatrix {
  rows: string[];
  cols: string[];
  values: Matrix;
}

export function namedMatrix(rows: readonly string[], cols: readonly string[], values?: Matrix): NamedMatrix {
  return {
    rows: [...rows],
    cols: [...cols],
    values: values ?? zeros(rows.length, cols.length),
  };
}

function indexOfName(names: readonly string[], name: string, kind: string): number {
  const i = names.indexOf(name);
  if (i === -1) throw new Error(`Unknown ${kind} name: ${name}`);
  return i;
}

export function nmGet(m: NamedMatrix, row: string, col: string): number {
  return m.values[indexOfName(m.rows, row, "row")]![indexOfName(m.cols, col, "column")]!;
}

export function nmSet(m: NamedMatrix, row: string, col: string, value: number): void {
  m.values[indexOfName(m.rows, row, "row")]![indexOfName(m.cols, col, "column")] = value;
}
