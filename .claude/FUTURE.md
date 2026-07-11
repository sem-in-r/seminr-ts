# seminr-ts — needed / potential follow-ups

> Deferred work and known gaps vs seminr. Full parity reassessment vs seminr's NAMESPACE done 2026-07-04; every non-plotting exported feature shipped as of branch `parity` (`.claude/plans/PLAN.parity.md`) — what remains below is deliberately deferred or out of scope. Update this file when an item ships or a new deferral is decided.

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

Last updated: 2026-07-11 (branch `plot`: plotting layer shipped; residual plotting deferrals recorded)
