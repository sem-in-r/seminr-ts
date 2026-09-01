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

- **Deferred with the plan (not scheduled)**: the column-major representation migration (`NamedMatrix`/`nmSet` → `@compstats/core`'s `Matrix`) — see plan 010 slice 3 for the cost, which is a breaking change on both the root barrel and `./math`. Also deferred: replacing normal-equations OLS with compstats' QR-based `lm` in `src/specify/interactions.ts` and `src/predict/chunk.ts` (lands *closer* to R but moves numbers that currently pass at 1e-5 — a parity change, not a refactor), and swapping `src/plot/charts/predictError.ts`'s direct kernel sum for compstats' FFT-binned `kernelDensity` (different binning, and the plot fixture is byte-compared).

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

Last updated: 2026-09-01 (branch `refactor-compstatslib`: `@compstats/core` delegation deferrals recorded)
