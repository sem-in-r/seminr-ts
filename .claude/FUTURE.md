# seminr-ts — needed / potential follow-ups

> Deferred work and known gaps vs seminr. Full parity reassessment vs seminr's NAMESPACE done 2026-07-04; every non-plotting exported feature shipped as of branch `parity` (`.claude/plans/006-PLAN-parity/PLAN.md`) — what remains below is deliberately deferred or out of scope. Update this file when an item ships or a new deferral is decided.

## CBSEM/CFA follow-ups

- **Missing data (FIML / listwise options)** — seminr does not handle missing data for CBSEM (lavaan listwise default; mobi is complete). FIML would flip on a meanstructure and observed information — a significant estimator extension.
- **`higher_composite` for CBSEM** — unsupported in seminr (only `higher_reflective`); revisit only if seminr adds it.
- **Meanstructure / intercepts, bounds/constraints DSL, multi-group SEM** — absent from seminr's CBSEM surface; would be new scope beyond parity.
- **`csem2seminr` parser depth** — the shipped minimal parser covers `=~`/`<~`/`~` and rejects constraints/labels (as seminr's experimental importer effectively does); extend only if users bring richer lavaan syntax.

## PLS deliberate exclusions (not gaps)

- **`predict_pls`'s `reps` argument** — re-runs CV on the same fold assignment (no RNG inside `prediction_matrices`), so it only averages identical matrices; not ported.
- **`is_only_endogenous`** — shipped with the plotting engine (branch `plot`) as `isOnlyEndogenous` in `src/plot/dotEngine.ts` (internal to the dot-graph coding, as in R).
- **`computeItCriteriaWeights` NaN handling** — deviates from seminr's NA-poisoned `min()` (its `na.rm` only guards the sum); we skip NaNs in both, honoring the na.rm intent (documented in the source).

## Performance follow-ups (branch `performance`, 2026-07-06)

- **Flat typed-array (Float64Array) matrix storage** — deliberately deferred (plan Q2). After the `performance` branch landed the algorithmic wins (single-pass column stats, iteration-invariant outer-mode preparation, in-place standardization, shared design-matrix factorization), the remaining simplePLS loop cost is fundamental `number[][]` matmul/standardize arithmetic. Flat storage would rewrite every matrix consumer for an unproven constant factor; revisit only if a future profile shows matmul dominating a workload that matters. `benchmark/equivalence.ts` (tolerance-0 harness) is the safety net if attempted.
- **CBSEM/CFA estimator performance** — out of the `performance` branch's scope (own optimizer/gradient code paths); profile separately if CBSEM bootstrap-style workloads ever appear.

## Math layer — `@compstats/core` delegation (**shipped in v0.4.0**, merge `d00f9af`; plans `.claude/plans/010-PLAN-compstatslib/PLAN.md` and `011-PLAN-compstats-0.6/PLAN.md`)

> Plan 010 adopted 0.5.0's scalar layer and declined the rest. Plan 011 took 0.6.0, which answered
> the report we sent upstream: the optimizer became R's own `vmmin` and was adopted, the linear
> algebra was re-measured with its blocker removed and declined again, and slice 3 finally has a
> price. What remains below is what is still open.

- ~~**Retire the extras-facing `@seminr/core/math` exports**~~ — **shipped in v0.5.0** (branch `compstats-0.7`). Nine names went, not six: the table below omitted `lgamma`, `lowerRegGamma` and `incompleteBeta`, which have no `src/` caller outside `math/` either. `seminrExtras-ts` migrated off the subpath entirely, closing gate (2); gate (1) was met by v0.4.0. Only `tCdf` lost its implementation. **`jacobiEigenSym` kept its** — the row below was right and a downstream audit that scoped consumers as "outside `math/`" got it wrong, because `symMatrixPower` calls it inside `math/` and ours clamps where `eigenSymmetric` does not. The deprecation-notice-one-release-ahead rule below was **waived deliberately**: pre-1.0, `^0.4.0` resolves to `>=0.4.0 <0.5.0`, so the caret range already withholds the release from every existing consumer and the notice protects nobody who is not opting in anyway. `tests/math/facade.test.ts` now asserts the nine names are *absent*, not merely unlisted. Original analysis:

  | Symbol | Uses inside `seminr-ts/src` | Delegated by us? | `@compstats/core` counterpart | Extras call sites |
  | --- | --- | --- | --- | --- |
  | `tCdf` | **0** | yes | `pt(x, df)` (`/stats`) | `src/helpers.ts` |
  | `jacobiEigenSym` | **0** | no — `symMatrixPower` needs it, and ours now clamps | `eigenSymmetric` (`/linalg`) | `demos/primer-chap4.ts` |
  | `quantile` | 14 uses / 4 files | yes | `quantile` (`/stats`) | `src/helpers.ts`, `src/featureCta.ts`, `src/featureCoa.ts`, `src/plotting/results.ts` |
  | `solve` | 18 uses / 11 files | no — hot paths stay ours | `solve(a, b)` (`/linalg`) | `src/featureFimix.ts`, `src/featureCipma.ts` |
  | `colCor` | 20 uses / 7 files | **no — declined twice** | `cor(x, y)` (`/linalg`) | `src/featureCongruence.ts`, `tests/congruence.test.ts` |
  | `colCov` | 4 uses / 2 files | **no — declined twice** | `cov(x, y)` (`/linalg`) | `src/featureCta.ts`, `tests/cta.test.ts` |

  Only `tCdf` has no internal caller, so only it can go implementation and all. For the others, "retire" means **removing the export from the `./math` facade** — `seminr-ts` still calls them internally.

  **Gated on two things, in order: (1) the refactor lands on `main`, and (2) `seminrExtras-ts` migrates these call sites to `@compstats/core` directly and releases.** Deleting them before extras moves breaks a published downstream package. `quantile` and `tCdf` are scalar swaps for extras; the other four hand back a column-major `Matrix`, so extras converts at those call sites or adopts the type — its decision, not ours.

  Removing exported names from `@seminr/core/math` is a **breaking change** — it needs a major bump and a deprecation notice in the subpath's docstring one release ahead. The subpath does *not* become empty (the matrix vocabulary and the CBSEM primitives stay), so it survives the removal.

- ~~**`src/cbsem/tenBerge.ts` is one rounding bit away from NaN**~~ — **fixed** (plan 011, commit `db18de3`). `symMatrixPower` now treats `|lambda| <= n * eps * max|lambda|` as exactly zero and maps it to zero under a negative power, the Moore-Penrose convention; a genuinely negative eigenvalue is still left alone so indefiniteness stays visible as a NaN. Measured cost on C5: construct scores and item weights move by at most 6.19e-8 against a 5e-5 fixture tolerance, because the null direction was contributing `1.05e-15 * 9.1e7 = 9.5e-8` — noise amplified by 1e8.

  **Still worth raising with the other ports.** seminr's R shares the defect: `compute_ten_berge.R`'s `%^%` goes through `eigen()` and `values^power`, so a negative artefact gives NaN with a warning. `../seminr/` and `../seminr-py/` will hit it on the same model, and our fix is a deliberate departure from `%^%` rather than a port of it.

- ~~**`@compstats/core`'s declarations do not resolve under Node16/NodeNext**~~ — **fixed upstream in 0.6.0**, verified from this side: under the repo's own settings (`NodeNext`, `skipLibCheck: true`) `pchisq("hello", {}, [], 1, 2, 3)` is now a compile error where under 0.5.0 it was not. The explicit annotations at each delegation and `tests/math/compstats-types.test.ts` **stay** — the test now checks the upstream property directly (every relative specifier in the installed `dist/**/*.d.ts` carries its extension), which `bun run typecheck` cannot see with `skipLibCheck` on, and the annotation rule sits behind it as a regression guard.

- **CBSEM linear algebra → `@compstats/core/linalg` was prototyped and declined twice**, on different grounds each time, so do not re-open it without a new reason.

  Plan 010 declined it because `{fma: true}` cost +72% wall clock and `{fma: false}` broke the C5 fixture. Plan 011 re-ran it after `db18de3` removed that fixture blocker, and **both variants now pass all 70 CBSEM tests**. The new numbers:

  | | closer to lavaan | worst mean rel. diff | ECSI (ML) | C5 HOC |
  | --- | --- | --- | --- | --- |
  | ours (`src/math/cholesky.ts`) | — | 9.642e-6 | 21.4 ms | 65.4 ms |
  | `chol`, `{fma: false}` | 32 of 51 | 9.663e-6 | 24.3 ms | 64.8 ms |
  | `chol`, `{fma: true}` | 33 of 51 | 9.610e-6 | **66.6 ms** | **111.7 ms** |

  So `{fma: true}` costs up to 3× the fit for a property no assertion here can see, and `{fma: false}` is timing-neutral (the conversion inside the optimizer loop eats the operation's gain) and buys 0.7% at the median — as likely away from lavaan as toward it — while renumbering every CBSEM output. Free is not a reason to move thousands of published numbers. If it is ever revisited, `standardize` needs a decision too: it throws on a zero-variance column where compstats' `scale` returns NaN as R does — keep the throw, matching seminr's own `standardize_safely`.

- ~~**The BFGS optimizer stays seminr-ts's own**~~ — **delegated** (plan 011, commit `ef5f32e`). 0.6.0 replaced its `optim` with R's own `vmmin`, which turned the question from "who maintains this" into a measurement: across all 51 CBSEM fixture comparisons `vmmin` at `reltol = 1e-15` lands closer to lavaan on **42**, against 8 for the retired routine, and halves the worst case (2.05e-5 → 9.64e-6). No fixture needed re-pinning because the move is toward the reference. Cost: the C5 higher-order fit is 33% slower; every other CBSEM fit is neutral or faster.

  The two control-block traps recorded by plan 010 still stand and are now in `src/math/optimize.ts`'s docstring: R's `maxit` default is 100 and its `reltol` default is `sqrt(eps)` = 1.49e-8, and inheriting the second stops the ECSI fit 21 iterations early while still reporting `convergence: 0`. `bfgs` sets all of them explicitly and **throws** on the retired `gradTol`/`stallGradTol` rather than ignoring them.

- **The column-major representation migration (slice 3) — now priced, still not scheduled.**

  **Re-priced after v0.4.0 shipped — read plan 011's G7 and G8 before acting on any of the numbers below.** The conversion boundary turned out to be avoidable entirely (a row-major caller adopts its buffer transposed, no reordering), and the speed gain is the representation rather than upstream's arithmetic, which is a tie. The remaining case for adopting their ops is reach — `qr`, `lm`, `solve`, `chol` over held buffers — not speed.

  *What it would buy*, measured in plan 011 rather than assumed: **`matmul` is 50.9% of a 200-replication bootstrap** (314.5 ms of 618 ms, 6 029 calls), and compstats' `matmul` over an adopted buffer is **1.4× to 2.4× faster on our exact shapes** — and **bit-identical** to ours (3 111 cells checked with `Object.is`, zero differences: our loop skips zero multipliers and accumulates over the inner index in the same order). That prices the migration at roughly **20-25% of bootstrap wall clock with no numeric movement**.

  *What it would not buy*: `colCor` and `olsColumns` together are only 11.8% of the bootstrap, `cor` gains 12% and is **not** bit-identical (24 of 36 cells differ by one ulp), and OLS through `crossprod` + `solve` is **2.2× slower than `olsColumns`** even with the boundary removed. Plan 010 and the upstream note both aimed at exactly these three. The target was wrong.

  *What it would cost*: **182 uses of the `NamedMatrix` type across 30 files**, 91 `namedMatrix` calls, 55 `nmGet`, and 29 `nmSet` writes across 7 files. It is also a **breaking change on two entry points**: `seminrExtras-ts` reaches `NamedMatrix`, `namedMatrix`, `nmGet` and `mulberry32` through the root `@seminr/core` barrel (8 files) as well as `@seminr/core/math`.

  *What 0.7.0 added, and why it does not reopen this*: `fromRows` stopped allocating a `Float64Array` per row and went from 23.2 to 3.7 µs on a 250x5 frame, 505 to 70 µs at 2000x24. That was the boundary cost plan 010 priced into its decline — but plan 011 had **already** re-priced the decline with the boundary removed (see the paragraph above), and declined on the representation instead. The number changed under a decision that no longer rests on it. Reported by the `@compstats/core` maintainer as a changed number rather than a recommendation, and recorded here for the same reason.

  *What 0.6.0 already solved*: the conversion boundary. `withDim(data, {nrow, ncol, dimnames})` **adopts** a `Float64Array` without copying, and `matrixIndex(m)` gives `{row, col, offset}` resolved once — upstream's answer to the name-addressed builder we asked for, and a better one, since none of our 29 `nmSet` sites is a pure function of `(rowName, colName)` over the full grid. Neither is usable before the representation changes; both are what makes it possible.

  *A cheaper partial that was measured and rejected*: a drop-in `matmul` that flattens, calls compstats and unflattens is **44.1 → 44.7 µs** on the shape that dominates and 21.0 → 15.8 µs on the small one — a few per cent across the bootstrap, for a conversion boundary inside the most bit-pinned function in the package.

  Also deferred: replacing normal-equations OLS with compstats' QR-based `lm` in `src/specify/interactions.ts` and `src/predict/chunk.ts` (lands *closer* to R but moves numbers that currently pass at 1e-5 — a parity change, not a refactor), and swapping `src/plot/charts/predictError.ts`'s direct kernel sum for compstats' FFT-binned `kernelDensity` (different binning, and the plot fixture is byte-compared).

- **Per-site R parity does not imply composite convergence, and the difference is measurable.** After v0.5.0 corrected `mean`, `sd` and `standardize()` against R, the `seminrExtras-ts` port measured the change across **1574 `pathCoef` and `outerWeights` cells** against R goldens: 244 moved, **117 closer to R and 113 farther**; exact matches 57 → 61; mean absolute residual 2.223e-17 → 2.160e-17; **worst case 8.882e-16 → 1.332e-15**. A wash, nine orders inside their 1e-5 tolerance.

  Every individual change was toward R and provably so — the conformance fixtures pin exact doubles. What does not follow is that an estimate built from a hundred such operations lands closer, because the association orders in `matmul`, the PLS iteration and the standardization chain still differ from R's, and at a 1e-16 residual the sign of the net change is decided by rounding somewhere else entirely.

  **So do not justify future numeric work by "it will improve parity downstream."** Justify it by whether the site computes the R function, which is checkable, rather than by whether the composite moves, which at this residual is noise. The acceptance bar in `.claude/CLAUDE.md` — parity with seminr on mobi — is a *tolerance* bar for exactly this reason.

- **The `cov`/`cor` call form was measured and needs no change.** `@compstats/core`'s README warns that R's `cov.c` takes a different path for one matrix than for two, so porting `stats::cor(x)` as `cor(x, x)` does not reproduce R — and `estimate_simplePLS.R:178` is `stats::cor(construct_scores)`, the one-matrix form, which this package writes as `colCor(x, x)` at nine sites. Measured on four mobi item blocks (R 4.5.3, 92 cells): R's own `cor(x)` and `cor(x, x)` differ on 48 of them, and **our `colCor(x, x)` matches the one-matrix form on 84 and the two-matrix form on 44**. So our symmetric branch already *is* the one-matrix routine in effect; the warning applies to consumers who delegated to upstream's two-argument `cor`, which we declined to do.

  The residual 8 cells are not reachable by changing the call form: R's `cor(x)` cannot be reconstructed inside R either. `cov(x) / outer(sd, sd)` scores 22 of 25 on the IMAG block and `cov(x) / sqrt(outer(diag, diag))` scores 19 — against our own 22. Closing it would mean porting `cov.c`'s inner loop verbatim, for a ulp. Not worth reopening without a fixture that needs it.

- **`src/evaluate/validity.ts`'s centered-column reuse stays ours.** Upstream shipped a documented `scale` → `crossprod` recipe for it (their §7). We already have the optimization — `centerColumns`/`corFromCentered` since plan 008 — and the recipe reaches the same place by a route that moves bits, so there is nothing to buy.

## Out of scope (both estimators) — will have to get done eventually

1. ~~**Plotting / presentation layer**~~ — **shipped on branch `plot` (2026-07-11)**, `src/plot/`: `dotGraph`/`plot`, themes, `plotHtmt`, CBSEM/CFA diagrams, `savePlot` (svg/dot/gv), and the four chart plots as dependency-free SVG (`plotScores`, `plotReliabilityTable`, `slopeAnalysis`/`plotInteraction`, `plotPredictError`). The `print.summary.*` console formatters remain demo-level helpers (`demos/lib/print.ts`), not library surface. Residual plotting deferrals:
   - **Raster/other export formats** (PNG/PDF/PS/webp) — `save()` supports svg/dot/gv only; PNG could come via `@resvg/resvg-wasm` on the rendered SVG.
   - **`browse_plot`, `get_theme_doc`** — R-session conveniences, not ported.
   - **Interactive/HTML widget layer** — out of scope.
   - **`plot.randomizedweights` RNG jitter parity** — the theme flag is accepted but ignored (as in the py port); R's jitter rides its RNG stream and cannot be matched byte-for-byte.
   - **d3 pure submodules for chart internals** (plan D5 addendum) — hand-rolled tick/path math proved sufficient; revisit only if the chart set grows.
2. **npm packaging / publishing** — checks before first release: package-name availability, LICENSE (seminr is MIT-compatible — verify attribution requirements for derived work), `files`/`exports` review, README install instructions.

## CBSEM technical debt / notes

- Parity tolerances are bounded by optimizer stopping error in double precision (plan Q7): fixtures use BFGS-polished lavaan optima; ridge-dominated matrices compare at mean-rel 5e-5. If fixtures are ever regenerated, keep the `optim.method="BFGS", control=list(reltol=1e-15)` override or the CBSEM parity tests will drift.
- `estimate_cfa` on the full C3 ECSI measurement model fails in seminr itself (non-PD latent covariance post-check) — not a seminr-ts bug; documented in plan Q5.
- Fixture quirk: R `NA` cells serialize as the string `"NA"` in fixture JSON; comparator handles it (`tests/cbsem/helpers.ts`).

## Process notes

- This file is committed (`.gitignore` carries a `!.claude/FUTURE.md` exception), unlike the plans in `.claude/plans/`, which stay gitignored and Sideways-synced.
- Known test-runner quirk (pre-existing, observed 2026-07-11, Bun 1.3.14): `bun test tests/demos.test.ts` **in isolation** fails its browser-server case with `Could not resolve: "../../src/index.ts"` from `Bun.build` — unless another test file that imports `src/` runs in the same process first (the full suite always passes). Reproduces on `main`; revisit if a Bun upgrade fixes it.

---

Last updated: 2026-09-01 (branch `refactor-compstatslib`: slice 1 shipped; slice 2 and the `optim` delegation declined with measurements; the C5 ten Berge singularity and the upstream TS2834 defect recorded)
