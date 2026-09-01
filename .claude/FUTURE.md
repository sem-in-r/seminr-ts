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

## Math layer — `@compstats/core` delegation (branch `refactor-compstatslib`, plan `.claude/plans/010-PLAN-compstatslib/PLAN.md`)

- **Retire the extras-facing `@seminr/core/math` exports** — all six have an R-pinned counterpart in `@compstats/core` 0.5.0, but they fall into two very different groups, and only the first can actually be deleted:

  | Symbol | Uses inside `seminr-ts/src` | Delegated by plan 010? | `@compstats/core` counterpart | Extras call sites |
  | --- | --- | --- | --- | --- |
  | `tCdf` | **0** | yes (slice 1) | `pt(x, df)` (root) | `src/helpers.ts` |
  | `jacobiEigenSym` | **0** | only if slice 2 ships | `eigenSymmetric` (`/linalg`) | `demos/primer-chap4.ts` |
  | `quantile` | 14 uses / 4 files | yes (slice 1) | `quantile` (root) | `src/helpers.ts`, `src/featureCta.ts`, `src/featureCoa.ts`, `src/plotting/results.ts` |
  | `solve` | 18 uses / 11 files | no — hot paths stay ours | `solve(a, b)` (`/linalg`) | `src/featureFimix.ts`, `src/featureCipma.ts` |
  | `colCor` | 20 uses / 7 files | **no — declined** | `cor(x, y)` (`/linalg`) | `src/featureCongruence.ts`, `tests/congruence.test.ts` |
  | `colCov` | 4 uses / 2 files | **no — declined** | `cov(x, y)` (`/linalg`) | `src/featureCta.ts`, `tests/cta.test.ts` |

  Only `tCdf` and `jacobiEigenSym` have no internal caller, so only those two can go implementation and all. For the other four, "retire" means **removing the export from the `./math` facade** — `seminr-ts` still calls them internally, and `colCor`/`colCov` keep their hand-written implementations for good (plan 010 F7: they run inside the PLS iteration inside every bootstrap replication, where the row-major → column-major conversion costs more than the operation).

  **Gated on two things, in order: (1) the plan-010 refactor lands on `main`, and (2) `seminrExtras-ts` migrates these call sites to `@compstats/core` directly and releases.** Deleting them before extras moves breaks a published downstream package. `quantile` and `tCdf` are scalar swaps for extras; the other four hand back a column-major `Matrix`, so extras converts at those call sites or adopts the type — its decision, not ours.

  Removing exported names from `@seminr/core/math` is a **breaking change** — it needs a major bump and a deprecation notice in the subpath's docstring one release ahead. The subpath does *not* become empty (the matrix vocabulary and the CBSEM primitives stay), so it survives the removal.

- **`src/cbsem/tenBerge.ts` is one rounding bit away from NaN on the C5 higher-order model — a real, pre-existing defect.** In a model whose second-order factor loads on exactly two first-order factors (`higherReflective("ImageSat", ["Image", "Satisfaction"])`), the five latent loading columns span four dimensions, so `L' R⁻¹ L` is **structurally singular** and its smallest eigenvalue is a pure rounding artefact — measured at `+1.2e-16` today. `symMatrixPower(_, -0.5)` raises it to the power −½, so a *negative* artefact of the same size produces `NaN` factor scores instead of a finite (if enormous) value that cancels downstream.

  This is not hypothetical and not caused by any change on branch `refactor-compstatslib`: **three independent perturbations of the CBSEM optimum at the 1e-8 level flipped the sign and broke the fixture** during plan 010 — delegating the optimizer to `@compstats/core`'s `optim`, and both arithmetic settings of its `chol`. The current code passes because the coin landed heads, not because it is right.

  seminr's R shares the defect: `compute_ten_berge.R`'s `%^%` goes through `eigen()` and `values^power`, which yields `NaN` with a warning on a negative eigenvalue. So a fix has to decide what the *right* answer is for a rank-deficient inner matrix (clamp the null direction to zero? use a pseudo-inverse? refuse the model with a clear error?), and any choice moves the C5 fixture off its seminr-generated value. That makes it a parity question for both ports, worth raising with `../seminr/` and `../seminr-py/` rather than patching quietly here.

  **Until it is fixed, treat any change that perturbs a CBSEM optimum at 1e-8 as a fixture risk**, and run `tests/cbsem/estimateCbsem.test.ts` before trusting a green partial suite.

- **`@compstats/core`'s declarations do not resolve under Node16/NodeNext** (0.5.0): `dist/*.d.ts` re-export relatively without file extensions (`export { mean } from "./core/arith"`), which TypeScript rejects with TS2834 for a `"type": "module"` package. `skipLibCheck: true` — which this repo sets, as most do — turns the error into silence, and every imported name becomes `any`. It affects `./linalg` as well as the root. The consequence for us is not a compile error but a **types regression in published output**: a bare `export const lgamma = logGamma` would ship `lgamma: any` in `dist/math/index.d.ts`. Worked around by annotating every delegation explicitly, enforced by `tests/math/compstats-types.test.ts`. **Delete the workaround and that test once upstream ships extensions and the pinned version requires them** — at that point `bun run typecheck` catches a leak on its own.

- **Slice 2 of plan 010 (CBSEM linear algebra → `@compstats/core/linalg`) was prototyped and declined**, not merely deferred. Converting `src/cbsem/mlFit.ts`'s `cholesky`/`cholInverse` to `chol`/`chol2inv` was measured both ways: R-exact `{ fma: true }` costs **+72% wall clock** on `estimateCbsem` (176.5 ms → 304 ms), and the fast `{ fma: false }` path costs +5% *and* breaks the C5 fixture above. Either setting renumbers every CBSEM output — the optimizer's iteration count changes, and robust `vcov` moves at 1e-4 relative — so it is a parity change requiring every CBSEM golden fixture to be re-pinned, for precision no assertion can observe. Revisit only if a profile shows the Cholesky dominating a workload that matters, or if the fixtures are being re-pinned anyway for another reason. If it is revisited, `standardize` needs a decision too: it throws on a zero-variance column where compstats' `scale` returns NaN as R does — keep the throw, matching seminr's own `standardize_safely`.

- **The BFGS optimizer stays seminr-ts's own** (plan 010, task 1d, declined). `@compstats/core`'s `optim` *is* this routine, taken upstream and given R's call shape, and its own docs say it is not R's algorithm — so there is no accuracy to gain, only a maintenance boundary to move. Two concrete traps are recorded in `src/math/optimize.ts`'s docstring for anyone who tries again: `optim`'s `maxit` defaults to R's 100 (against `mlFit`'s 10000), and its `reltol` defaults to R's `sqrt(eps)` = 1.5e-8 against the retired 1e-14 — inheriting that second default stops the ECSI fit 21 iterations early and moves parameters by 2.5e-4, five times the fixture tolerance.

- **The column-major representation migration (plan 010 slice 3) — documented, not scheduled.**

  *What it would buy*: one shared, R-pinned linear algebra layer instead of two. `src/math/matrix.ts`'s row-major `number[][]` and `@compstats/core`'s column-major `Float64Array` express the same idea twice, and every routine that crosses between them pays a conversion. Adopting theirs would also bring `dimnames`, `crossprod`, `qr` and `lm` for free.

  *What it would cost*, counted against `src/**` excluding `src/math/` itself: **182 uses of the `NamedMatrix` type across 30 files**, 91 `namedMatrix` calls, 55 `nmGet`, and — the sharp edge — **29 `nmSet` writes across 7 files**. `@compstats/core` deliberately offers **no name-addressed setter**: its matrix is plain data written by whole-array operations, as R's is. Those 29 sites do not translate; they are a rewrite of how those seven files build their results. It is also a **breaking change on two entry points**, not one: `seminrExtras-ts` reaches `NamedMatrix`, `namedMatrix`, `nmGet` and `mulberry32` through the root `@seminr/core` barrel (8 files) as well as `@seminr/core/math`.

  And there is a cost the 0.5.0 benchmark table does not price: `fromRows`/`toRows` runs at 868 µs / 403 µs for an n × 24 frame at n = 2000, more than any single operation in that table. In `src/estimate/simplePls.ts` the `cor`/`solve` pair sits inside the PLS iteration inside every bootstrap replication, so a conversion there is a large regression unless it happens once outside both loops.

  *What would have to be true first*: either upstream offers a **name-addressed builder** — `dimnames` plus a fill function, whole-array in spirit — that removes the `nmSet` blocker, or this repo decides to write those seven files whole-array style; and a major version is on the table anyway, since extras breaks on both doors. Plan 010's 4f note carries the ask upstream.

  Also deferred: replacing normal-equations OLS with compstats' QR-based `lm` in `src/specify/interactions.ts` and `src/predict/chunk.ts` (lands *closer* to R but moves numbers that currently pass at 1e-5 — a parity change, not a refactor), and swapping `src/plot/charts/predictError.ts`'s direct kernel sum for compstats' FFT-binned `kernelDensity` (different binning, and the plot fixture is byte-compared).

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
