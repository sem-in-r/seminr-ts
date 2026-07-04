# semints — needed / potential follow-ups

> Deferred work and known gaps, consolidated from `PLAN.research-seminr.md` (PLS port) and `PLAN.cbsem.md` (CBSEM/CFA port). Each item notes why it was deferred and where the groundwork sits. Update this file when an item ships or a new deferral is decided.

## CBSEM/CFA follow-ups

### MLR robust layer (highest-value CBSEM gap)

seminr's default estimator is `"MLR"`; semints currently produces identical **point estimates** but ML-based inference (`se = "standard"`, unscaled fit). Documented in README Status. Shipping this makes `summarizeCbsem` output match seminr's printed SEs/z/p and `.scaled`/`.robust` fit columns side by side.

- Needs: observed-information Hessian (numeric Hessian of the analytic gradient is acceptable), casewise-score cross-products (B0 "meat"), sandwich `A⁻¹B0A⁻¹/N`, Γ fourth-moment matrix (`lav_samplestats_gamma.R`), Yuan-Bentler-Mplus scaling factor `c ≈ tr(UΓ)/df`, robust CFI/TLI/RMSEA variants.
- Groundwork in place: Δ Jacobian (`src/cbsem/standardErrors.ts`), MLR-variant parity targets already exported in every `cbsem-*.json` fixture (`mlr` key: parameterEstimates, standardizedSolution, full fitMeasures).
- References: lavaan `lav_model_vcov.R:261-333`, `lav_test_yuan_bentler.R`; digest in `PLAN.cbsem.md` F3.

### Smaller CBSEM items

- **`specifyModel()` bundling** — seminr's `specify_model(mm, sm, associations)` single-object form (with component override rules, `specify_models.R:21-43`). Trivial; nothing in the demos needs it.
- **`import_lavaan_syntax` / `lavaan2seminr`** (plan Q6) — reverse direction: lavaan syntax string → seminr model (drives seminr's `lavaan_model=` argument). Experimental in seminr itself; port only if users ask for lavaan-string input.
- **Orthogonal interactions under CBSEM** — seminr's closure would run but is untested there (no seminr fixture exists). Our `processCbsemInteractions` would pass it through; add fixtures + tests before advertising.
- **Missing data (FIML / listwise options)** — seminr does not handle missing data for CBSEM (lavaan listwise default; mobi is complete). FIML would flip on a meanstructure and observed information — a significant estimator extension.
- **Browser demo CBSEM** — add a CFA/CBSEM section to `demos/browser/` for runtime symmetry with the CLI demo. `src/cbsem/` is already browser-bundle-guarded via the index.
- **`higher_composite` for CBSEM** — unsupported in seminr (only `higher_reflective`); revisit only if seminr adds it.
- **Meanstructure / intercepts, bounds/constraints DSL, multi-group SEM** — all absent from seminr's CBSEM surface; would be new scope beyond parity.

### CBSEM technical debt / notes

- Parity tolerances are bounded by optimizer stopping error in double precision (plan Q7): fixtures use BFGS-polished lavaan optima; ridge-dominated matrices compare at mean-rel 5e-5. If fixtures are ever regenerated, keep the `optim.method="BFGS", control=list(reltol=1e-15)` override or Slice 4/5 tests will drift.
- `estimate_cfa` on the full C3 ECSI measurement model fails in seminr itself (non-PD latent covariance post-check) — not a semints bug; documented in plan Q5.
- Fixture quirk: R `NA` cells serialize as the string `"NA"` in fixture JSON; comparator handles it (`tests/cbsem/helpers.ts`).

## PLS follow-ups (deferred since the first plan)

- **HTMT + model-evaluation/reliability metrics suite** — `evaluate_*` family (Cronbach alpha, full rho_A reporting, fornell-larcker, item VIFs, fLoadings diagnostics). Unblocks the documented gap in the bootstrap vector layout where seminr carries HTMT (old plan Q5).
- **PLSpredict** (`feature_plspredict.R`) — out-of-sample prediction metrics.
- **PLS-MGA** (`estimate_pls_mga`) — multi-group analysis.
- **`na.omit` missing-data strategy** — only `mean_replacement` is implemented for PLS.
- **Plotting** (`plot_dot.R` / DiagrammeR equivalents) — likely a separate visualization package if ever.

## Packaging / publishing (old plan Q7)

- npm publishing checks before first release: package-name availability, LICENSE (seminr is MIT-compatible — verify attribution requirements for derived work), `files`/`exports` review, README install instructions.

## Process notes

- This file is committed (`.gitignore` carries a `!.claude/FUTURE.md` exception), unlike the plans in `.claude/plans/`, which stay gitignored and Sideways-synced.
- Merge-prep sequence for the `cbsem` branch lives in `PLAN.cbsem.md` (refactor pass → commit → review → merge); it is the immediate next step, not a future item.

---

Last updated: 2026-07-04
