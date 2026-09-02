/**
 * R's three means, pinned as exact doubles.
 *
 * `@compstats/core` 0.7.0 corrected its `mean` to R's `do_mean`, which makes a
 * second pass adding the mean of the residuals back. That is the right value
 * for a site porting R's `mean()` on a double vector — and the *wrong* value
 * for a site porting `colMeans()`, which is one uncorrected pass. seminr-ts has
 * both kinds, so this file exists to keep them apart:
 *
 *   1. `mean(<double>)`  — `do_mean` REALSXP (`src/main/summary.c`), corrected.
 *   2. `colMeans()`      — `do_colsum` (`src/main/array.c`), one pass.
 *   3. `mean(<integer>)` — `do_mean` INTSXP. Also one pass: the correction is
 *      in the REALSXP branch only, so on integer input `mean` *is* `colMeans`.
 *      Every bundled seminr dataset is integer, which is why this one is not a
 *      curiosity — see the storage-mode note in `src/math/stats.ts`.
 *
 * Everything is asserted with `Object.is`, not a tolerance. A tolerance is what
 * let this defect class survive three packages: the two forms differ by ulps,
 * so nothing at feature level sees them diverge. The fixtures come from
 * `scripts/generate-arith-fixtures.R`, and the synthetic vector in them was
 * chosen by a seed sweep *because* the naive form fails on it — a vector picked
 * for convenience stays green through the whole life of the bug it should catch.
 */

import { describe, it, expect } from "bun:test";
import { mean, sd, colMean, standardize, standardizeInPlace } from "../../src/math/stats.ts";
import { loadFixture, loadMobi } from "../helpers/fixtures.ts";

interface MobiColumn {
  column: string;
  meanInteger: number;
  meanDouble: number;
  colMeans: number;
  naive: number;
  sd: number;
  var: number;
  sdInteger: number;
  safelyScale: number;
  scaleDiffersFromSd: boolean;
  correctionMoves: boolean;
}

interface ArithFixture {
  rVersion: string;
  longDouble: boolean;
  mobi: {
    columns: MobiColumn[];
    columnCount: number;
    correctionMovesCount: number;
    correctionMovesCols: string[];
    scaleDiffersFromSdCount: number;
    scaleDiffersFromSdCols: string[];
  };
  swept: { seed: number; values: number[]; mean: number; naive: number; sd: number; var: number };
  disagreementRate: { trials: number; differing: number };
  bootstrapSample: { n: number; mean: number; naive: number; sd: number };
}

const fx = await loadFixture<ArithFixture>("arith");
const mobi = await loadMobi();

const column = (name: string): number[] => {
  const j = mobi.columns.indexOf(name);
  return mobi.values.map((row) => row[j]!);
};

describe("the exactness claim rests on a platform property, so check it first", () => {
  /**
   * R accumulates `do_mean` and `do_colsum` in `LDOUBLE`. Where that is a
   * 80-bit register, R's answers are unreachable from a TS double fold and
   * every `Object.is` below would be asserting something false. On arm64 macOS
   * `long double` is `double` and the flag is FALSE, which is what makes exact
   * comparison sound. Fail loudly rather than silently degrade if that changes.
   */
  it("was generated on an R without long-double accumulators", () => {
    expect(fx.longDouble).toBe(false);
  });
});

describe("mean is R's mean() on a double vector", () => {
  it("matches R exactly on a vector chosen because the naive form fails on it", () => {
    expect(Object.is(mean(fx.swept.values), fx.swept.mean)).toBe(true);
  });

  it("and the naive form really does fail on that vector", () => {
    // Guards the fixture itself: if the sweep ever regenerates onto a vector
    // where the two agree, the assertion above stops testing anything.
    expect(Object.is(fx.swept.mean, fx.swept.naive)).toBe(false);
  });

  it("matches R exactly on every mobi column", () => {
    for (const c of fx.mobi.columns) {
      expect(Object.is(mean(column(c.column)), c.meanDouble)).toBe(true);
    }
  });

  it("differs from the uncorrected pass on the 8 mobi columns R says it does", () => {
    const moved = fx.mobi.columns.filter((c) => !Object.is(mean(column(c.column)), c.colMeans));
    expect(moved.map((c) => c.column)).toEqual(fx.mobi.correctionMovesCols);
    expect(moved).toHaveLength(fx.mobi.correctionMovesCount);
  });
});

describe("colMean is R's colMeans(): one pass, no correction", () => {
  it("matches R's colMeans exactly on every mobi column", () => {
    for (const c of fx.mobi.columns) {
      expect(Object.is(colMean(column(c.column)), c.colMeans)).toBe(true);
    }
  });

  /**
   * The finding that makes the storage mode load-bearing: R's correction lives
   * in the REALSXP branch, so `mean()` on an integer vector takes the same
   * single pass `colMeans` does. Every bundled seminr dataset is integer, so a
   * call site porting `mean()` over *raw* data wants `colMean` here, not `mean`.
   */
  it("also matches R's mean() on the same data read as integers", () => {
    for (const c of fx.mobi.columns) {
      expect(Object.is(colMean(column(c.column)), c.meanInteger)).toBe(true);
    }
  });
});

describe("sd is R's sd(), which centers on the corrected mean", () => {
  it("matches R exactly on the swept vector", () => {
    expect(Object.is(sd(fx.swept.values), fx.swept.sd)).toBe(true);
  });

  it("matches R exactly on every mobi column", () => {
    for (const c of fx.mobi.columns) {
      expect(Object.is(sd(column(c.column)), c.sd)).toBe(true);
    }
  });

  /**
   * `var()` goes to `cov.c`, whose `MEAN` macro is `do_mean`'s body, and R
   * coerces integer input to double before it runs. So unlike `mean`, `sd` has
   * no storage-mode ambiguity — one answer for both.
   */
  it("does not depend on the storage mode of its argument", () => {
    for (const c of fx.mobi.columns) expect(Object.is(c.sd, c.sdInteger)).toBe(true);
  });
});

describe("standardize() centers on colMeans, as seminr's standardize_safely does", () => {
  /**
   * `compute_safe.R:15` is `center <- colMeans(x)`. Routing it through `mean`
   * was correct only while `mean` was itself uncorrected; at 0.7.0 it moves the
   * centre a full ulp off R on a third of mobi's columns.
   */
  it("takes every column centre from R's colMeans, exactly", () => {
    const st = standardize(mobi.values, mobi.columns);
    for (const c of fx.mobi.columns) {
      const j = mobi.columns.indexOf(c.column);
      expect(Object.is(st.means[j]!, c.colMeans)).toBe(true);
    }
  });

  /**
   * `standardizeInPlace` is the same arithmetic without the allocations and its
   * docstring promises so. It computes its centre locally, so the pair silently
   * splits the moment `standardize` centres on anything else — which is exactly
   * what the 0.7.0 bump did before `colMean` existed.
   */
  /**
   * `standardize_safely` never calls `sd()`. It takes the scale from the very
   * residuals it just centred on `colMeans`, so the scale inherits the
   * uncorrected centre; `sd()` centres on the corrected mean instead. The two
   * part company on 5 of mobi's 24 columns — a smaller set than the 8 whose
   * centres move, because a column's centre can shift without its spread
   * following.
   */
  it("takes every column scale from standardize_safely's own residuals, not sd()", () => {
    const st = standardize(mobi.values, mobi.columns);
    for (const c of fx.mobi.columns) {
      const j = mobi.columns.indexOf(c.column);
      expect(Object.is(st.sds[j]!, c.safelyScale)).toBe(true);
    }
  });

  it("and that scale really is a different number from R's sd() on 5 columns", () => {
    const differing = fx.mobi.columns.filter((c) => c.scaleDiffersFromSd).map((c) => c.column);
    expect(differing).toEqual(fx.mobi.scaleDiffersFromSdCols);
    expect(differing).toHaveLength(fx.mobi.scaleDiffersFromSdCount);
  });

  it("agrees with standardizeInPlace on every cell, bit for bit", () => {
    const a = standardize(mobi.values, mobi.columns).values;
    const b = mobi.values.map((row) => row.slice());
    standardizeInPlace(b);
    let differing = 0;
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < a[0]!.length; j++) if (!Object.is(a[i]![j], b[i]![j])) differing++;
    }
    expect(differing).toBe(0);
  });
});

describe("what the correction is worth, recorded rather than asserted in prose", () => {
  it("moves the mean on most random double vectors", () => {
    // R's own count over 20000 vectors of 50-300 uniform draws. Not a property
    // of our code -- it is why the distinction is worth carrying at all.
    expect(fx.disagreementRate.differing).toBeGreaterThan(fx.disagreementRate.trials * 0.8);
  });

  /**
   * The 500-value bootstrap sample pinned in `tests/math/stats.test.ts` is one
   * of the minority where the two forms agree. That is why the old
   * `Object.is(mean(sample), legacyMean(sample))` assertion there survived the
   * 0.7.0 upgrade while asserting a premise that had become false.
   */
  it("does not move the mean of the pinned bootstrap sample, which is why that guard held", () => {
    expect(Object.is(fx.bootstrapSample.mean, fx.bootstrapSample.naive)).toBe(true);
  });
});
