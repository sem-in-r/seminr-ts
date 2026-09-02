/**
 * Statistical primitives matching R semantics (sample SD, n−1 denominators).
 *
 * `mean`, `sd` and `quantile` are delegated to `@compstats/core`. The first two
 * are bit-identical to the loops they replace — both fold from 0 in the same
 * order — and `tests/math/stats.test.ts` asserts that with `Object.is`, not
 * closeness. `quantile` is not, and deliberately so: see its note below.
 *
 * Imported from `@compstats/core/stats`, the DOM-free entry. The explicit
 * annotations were load-bearing under 0.5.0, whose declarations did not resolve
 * under NodeNext; 0.6.0 fixed that and they are now documentation plus a guard
 * against a future regression. See the note in `distributions.ts` and
 * `tests/math/compstats-types.test.ts`.
 */

import { mean as csMean, sd as csSd, quantile as csQuantile } from "@compstats/core/stats";

/** Arithmetic mean, as R's `mean()`. */
export const mean: (x: readonly number[]) => number = csMean;

/** Sample standard deviation (n−1 denominator), as R's `sd()`. */
export const sd: (x: readonly number[]) => number = csSd;

/** Sample quantile by R's default type-7 rule, as R's `quantile()`. */
export const quantile: (x: readonly number[], p: number) => number = csQuantile;

/**
 * Column mean as R's `colMeans()` — `do_colsum` (`src/main/array.c`), a single
 * uncorrected pass. **Not** `mean` above, and the distinction is load-bearing.
 *
 * R has three means and this file exports two of them:
 *
 *   1. `mean(<double>)` — `do_mean`'s REALSXP branch (`src/main/summary.c`).
 *      Sums, divides, then makes a second pass adding the mean of the residuals
 *      back. The residuals are measured against the *rounded* first pass, so
 *      their sum recovers the error it accumulated instead of cancelling. This
 *      is the delegated `mean` above.
 *   2. `colMeans()` — `do_colsum`. One pass. This function.
 *   3. `mean(<integer>)` — `do_mean`'s INTSXP branch, which has no second pass.
 *      So on integer input R's `mean` *is* `colMeans`, and **every bundled
 *      seminr dataset is integer** (`sapply(mobi, storage.mode)`). A call site
 *      porting `mean()` over *raw* data therefore wants this function too; only
 *      sites over derived doubles — construct scores, bootstrap replicates,
 *      residuals, anything post-`standardize` — want the corrected one.
 *
 * They differ on 8 of mobi's 24 columns, and on ~89% of random double vectors.
 * `sd` and `var` have no such ambiguity: R coerces integer input to double and
 * `cov.c`'s corrected `MEAN` macro runs either way.
 *
 * Pinned against R as exact doubles in `tests/math/arith-conformance.test.ts`.
 * **Name the R function you are porting at every new call site** — the delegation
 * looks right whichever one you pick, because the name matches either way, and
 * the two differ by ulps that no feature-level fixture can see.
 */
export function colMean(x: readonly number[]): number {
  let s = 0;
  for (const v of x) s += v;
  return s / x.length;
}

export interface Standardized {
  values: number[][];
  means: number[];
  sds: number[];
}

/**
 * Z-score each column (sample SD), keeping the column means/sds, as seminr's
 * `standardize_safely` (compute_safe.R). Throws on zero-variance columns.
 *
 * **Centers on {@link colMean}, not {@link mean}.** `compute_safe.R:15` is
 * `center <- colMeans(x)`, which is R's uncorrected single pass; the scale is
 * `sqrt(colSums(res * res) / (n - 1))`, computed here from the same centered
 * residuals. Routing the centre through the corrected `mean` was correct only
 * while that function was itself uncorrected, and moves the centre a full ulp
 * off R on 8 of mobi's 24 columns once it is not.
 */
export function standardize(values: readonly (readonly number[])[], colNames?: readonly string[]): Standardized {
  const nrow = values.length;
  const ncol = values[0]!.length;
  const means: number[] = new Array(ncol);
  const sds: number[] = new Array(ncol);
  for (let j = 0; j < ncol; j++) {
    const col = new Array<number>(nrow);
    for (let i = 0; i < nrow; i++) col[i] = values[i]![j]!;
    // R's colMeans (do_colsum), not mean (do_mean) — see colMean's note.
    const m = colMean(col);
    means[j] = m;
    // NOT sd(col): standardize_safely takes the scale from the residuals it
    // just centered, so it inherits colMeans. sd() centers on the corrected
    // mean instead and parts company on 5 of mobi's 24 columns.
    let ss = 0;
    for (let i = 0; i < nrow; i++) {
      const d = col[i]! - m;
      ss += d * d;
    }
    sds[j] = Math.sqrt(ss / Math.max(1, nrow - 1));
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
 *
 * The `sum / nrow` below is {@link colMean} inlined — R's `colMeans`, matching
 * `standardize()`. The two are asserted bit-for-bit on every mobi cell in
 * `tests/math/arith-conformance.test.ts`; that assertion is what catches the
 * pair silently splitting if either centre is ever changed alone.
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

/**
 * `quantile` is R's default type-7 interpolation, re-exported at the top of
 * this file from `@compstats/core`.
 *
 * This one is *not* a bit-identical swap, and taking it was a parity decision
 * rather than a refactor. The implementation retired here interpolated as
 * `low + h * (high - low)`; R's `quantile.default` writes the same quantity as
 * `(1 - h) * low + h * high`, which is what `@compstats/core` follows. The two
 * are equal in exact arithmetic and differ in the last bit or two in doubles,
 * so every percentile CI in `src/bootstrap/` moves at the 1e-16 level — toward
 * R, which is the acceptance bar. `tests/math/stats.test.ts` pins both the
 * agreement with R and the shape of the difference.
 */
