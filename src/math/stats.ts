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

/**
 * In-place column z-scoring of a freshly allocated matrix — arithmetic
 * identical to `standardize()` (same mean and SD passes, same division per
 * cell) without the column-extraction and output allocations. Throws on
 * zero-variance columns like `standardize()`.
 */
export function standardizeInPlace(values: number[][]): void {
  const nrow = values.length;
  const ncol = values[0]!.length;
  for (let j = 0; j < ncol; j++) {
    let sum = 0;
    for (let i = 0; i < nrow; i++) sum += values[i]![j]!;
    const m = sum / nrow;
    let ss = 0;
    for (let i = 0; i < nrow; i++) {
      const d = values[i]![j]! - m;
      ss += d * d;
    }
    const s = Math.sqrt(ss / (nrow - 1));
    if (s === 0) throw new Error(`Cannot standardize: zero variance in column ${j}`);
    for (let i = 0; i < nrow; i++) values[i]![j] = (values[i]![j]! - m) / s;
  }
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

/** Mean-centered column arrays and their sample SDs, computed once per matrix. */
export interface CenteredColumns {
  centered: number[][];
  sds: number[];
  /** Row count of the source matrix. */
  n: number;
}

/**
 * Center every column and take its sample SD in one pass, for reuse across
 * repeated cov/cor block computations (see {@link corFromCentered}).
 */
export function centerColumns(m: readonly (readonly number[])[]): CenteredColumns {
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
  return { centered, sds, n: m.length };
}

/**
 * All-pairs cov/cor from precomputed column stats. The per-pair arithmetic —
 * Σ(x−mx)(y−my)/(n−1), then ÷(sd_x·sd_y) for correlations — matches the
 * pairwise `cov`/`cor` calls bit-for-bit. When a and b are the same object
 * the symmetric result is computed once per pair and mirrored (commutative
 * in fp).
 */
function crossFromCentered(a: CenteredColumns, b: CenteredColumns, correlate: boolean): number[][] {
  const n = a.n;
  const symmetric = a === b;
  const na = a.centered.length;
  const nb = b.centered.length;
  const out: number[][] = new Array(na);
  for (let i = 0; i < na; i++) out[i] = new Array<number>(nb);
  for (let i = 0; i < na; i++) {
    const ca = a.centered[i]!;
    const row = out[i]!;
    for (let j = symmetric ? i : 0; j < nb; j++) {
      const cb = b.centered[j]!;
      let s = 0;
      for (let r = 0; r < n; r++) s += ca[r]! * cb[r]!;
      let v = s / (n - 1);
      if (correlate) v = v / (a.sds[i]! * b.sds[j]!);
      row[j] = v;
      if (symmetric && j !== i) out[j]![i] = v;
    }
  }
  return out;
}

/** Column-wise cross-correlations from precomputed {@link centerColumns} stats. */
export function corFromCentered(a: CenteredColumns, b: CenteredColumns): number[][] {
  return crossFromCentered(a, b, true);
}

function crossColumns(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
  correlate: boolean,
): number[][] {
  const statsA = centerColumns(a);
  const statsB = a === b ? statsA : centerColumns(b);
  return crossFromCentered(statsA, statsB, correlate);
}

/** Quantile using R's default type-7 interpolation. */
export function quantile(x: readonly number[], p: number): number {
  const sorted = [...x].sort((a, b) => a - b);
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}
