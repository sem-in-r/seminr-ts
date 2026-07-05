/** Statistical primitives matching R semantics (sample SD, n−1 denominators). */

export function mean(x: readonly number[]): number {
  let sum = 0;
  for (const v of x) sum += v;
  return sum / x.length;
}

/** Sample standard deviation (n−1 denominator), as R's `sd()`. */
export function sd(x: readonly number[]): number {
  const m = mean(x);
  let ss = 0;
  for (const v of x) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (x.length - 1));
}

export interface Standardized {
  values: number[][];
  means: number[];
  sds: number[];
}

/**
 * Z-score each column (sample SD), keeping the column means/sds, as seminr's
 * `standardize_safely` (compute_safe.R). Throws on zero-variance columns.
 */
export function standardize(values: readonly (readonly number[])[], colNames?: readonly string[]): Standardized {
  const nrow = values.length;
  const ncol = values[0]!.length;
  const means: number[] = new Array(ncol);
  const sds: number[] = new Array(ncol);
  for (let j = 0; j < ncol; j++) {
    const col = new Array<number>(nrow);
    for (let i = 0; i < nrow; i++) col[i] = values[i]![j]!;
    means[j] = mean(col);
    sds[j] = sd(col);
    if (sds[j] === 0) {
      const name = colNames?.[j] ?? `column ${j}`;
      throw new Error(`Cannot standardize: zero variance in ${name}`);
    }
  }
  const out: number[][] = new Array(nrow);
  for (let i = 0; i < nrow; i++) {
    const row = new Array<number>(ncol);
    for (let j = 0; j < ncol; j++) row[j] = (values[i]![j]! - means[j]!) / sds[j]!;
    out[i] = row;
  }
  return { values: out, means, sds };
}

/** Sample covariance (n−1 denominator), as R's `cov()`. */
export function cov(x: readonly number[], y: readonly number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i]! - mx) * (y[i]! - my);
  return s / (x.length - 1);
}

/** Pearson correlation, as R's `cor()`. */
export function cor(x: readonly number[], y: readonly number[]): number {
  return cov(x, y) / (sd(x) * sd(y));
}

function column(m: readonly (readonly number[])[], j: number): number[] {
  const col = new Array<number>(m.length);
  for (let i = 0; i < m.length; i++) col[i] = m[i]![j]!;
  return col;
}

/** Column-wise cross-covariance matrix: cov of a's columns vs b's columns, as R's `cov(a, b)`. */
export function colCov(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
): number[][] {
  return crossColumns(a, b, false);
}

/** Column-wise cross-correlation matrix, as R's `cor(a, b)`. */
export function colCor(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
): number[][] {
  return crossColumns(a, b, true);
}

/** Per-column mean-centered values and sample SDs, computed once per matrix. */
function columnStats(m: readonly (readonly number[])[]): { centered: number[][]; sds: number[] } {
  const ncol = m[0]!.length;
  const centered: number[][] = new Array(ncol);
  const sds = new Array<number>(ncol);
  for (let j = 0; j < ncol; j++) {
    const col = column(m, j);
    const mj = mean(col);
    let ss = 0;
    for (let i = 0; i < col.length; i++) {
      const c = col[i]! - mj;
      col[i] = c;
      ss += c * c;
    }
    centered[j] = col;
    sds[j] = Math.sqrt(ss / (col.length - 1));
  }
  return { centered, sds };
}

/**
 * All-pairs cov/cor over the columns of a and b, with each column's mean/SD
 * computed once (the per-pair arithmetic — Σ(x−mx)(y−my)/(n−1), then
 * ÷(sd_x·sd_y) for correlations — is unchanged, so results are bit-identical
 * to the pairwise `cov`/`cor` calls). When a and b are the same object the
 * symmetric result is computed once per pair and mirrored.
 */
function crossColumns(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
  correlate: boolean,
): number[][] {
  const n = a.length;
  const statsA = columnStats(a);
  const symmetric = a === b;
  const statsB = symmetric ? statsA : columnStats(b);
  const na = statsA.centered.length;
  const nb = statsB.centered.length;
  const out: number[][] = new Array(na);
  for (let i = 0; i < na; i++) out[i] = new Array<number>(nb);
  for (let i = 0; i < na; i++) {
    const ca = statsA.centered[i]!;
    const row = out[i]!;
    for (let j = symmetric ? i : 0; j < nb; j++) {
      const cb = statsB.centered[j]!;
      let s = 0;
      for (let r = 0; r < n; r++) s += ca[r]! * cb[r]!;
      let v = s / (n - 1);
      if (correlate) v = v / (statsA.sds[i]! * statsB.sds[j]!);
      row[j] = v;
      if (symmetric && j !== i) out[j]![i] = v;
    }
  }
  return out;
}

/** Quantile using R's default type-7 interpolation. */
export function quantile(x: readonly number[], p: number): number {
  const sorted = [...x].sort((a, b) => a - b);
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}
