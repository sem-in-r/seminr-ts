# seminr-ts

TypeScript implementation of SEM (Structural Equation Modeling) estimation — PLS-SEM and covariance-based SEM (CBSEM/CFA) — ported from the [seminr](https://github.com/sem-in-r/seminr) R package (sibling repo at `../seminr/`).

## Project Status

PLS implementation complete (plan + seminr reference digest: `.claude/plans/PLAN.research-seminr.md`). CBSEM/CFA implementation complete on branch `cbsem` (plan + lavaan estimation digest: `.claude/plans/PLAN.cbsem.md`, referenced from `CLAUDE.local.md`). Plotting layer complete on branch `plot` (plan: `.claude/plans/PLAN.plot.md`). Read the relevant plan before making changes. Deferred work and known gaps are consolidated in `.claude/FUTURE.md` — check it before proposing new scope, and update it when deferring or shipping an item.

## Scope (implemented)

- Model specification DSL: constructs, composite/reflective measurement (incl. `modePlsc`), relationships/paths, interaction terms (product indicator, orthogonal, two-stage), higher-order constructs (two-stage composite + higher_reflective), item-error associations; named-argument call forms mirroring seminr; lavaan-syntax import (`csem2seminr`/`lavaan2seminr`); model traversal helpers (`allFactors`, `constructNames`, …)
- PLS estimation (simplePLS algorithm: path weighting/factorial schemes, outer modes A/B/UNIT) with PLSc correction for reflective constructs; `rerun` re-estimation with overridden inputs
- Bootstrapping (paths, loadings, weights, total effects; t-values and percentile CIs; injectable resampler; sequential + Web Worker parallel); mediation helpers (`specificEffectSignificance`, `totalIndirectCi`, `bootPathsDf`)
- PLS evaluation suite (`src/evaluate/`): reliability (alpha/rhoA/rhoC/AVE), validity (HTMT, Fornell-Larcker, cross-loadings, item + antecedent VIFs), effects (f², paths report, total indirect effects, AIC/BIC), descriptives, missing-data report; `summarizePls` via `summarize()` dispatch
- PLSpredict (`src/predict/`): `predictPls` k-fold/LOOCV cross-validated item + construct predictions with injectable fold ordering, DA/EA techniques, interaction-aware test-data augmentation (all three methods), LM benchmark, RMSE/MAE + construct-error summary; Web Worker parallel variant (`predictPlsParallel`); direct out-of-sample `predict(model, testData)` without CV
- PLS-MGA (`src/mga/`): `estimatePlsMga` — group split by boolean condition, per-group bootstrap, Henseler nonparametric p-values per structural path; Web Worker parallel variant (`estimatePlsMgaParallel`)
- Missing-data strategies: `meanReplacement` (default) and `naOmit`, threaded through f², PLSpredict, and bootstrap re-estimation (worker-safe by name); seminr-parity missing-data report and warnings
- CBSEM/CFA (`estimateCbsem`/`estimateCfa`): own ML estimator equivalent to `lavaan::sem/cfa(std.lv=TRUE)` — LISREL matrices, analytic gradient, BFGS; standardized solution, cor.lv, R², expected-information SEs + solution tables, fit measures, ten Berge construct scores, rhoC/AVE, antecedent VIFs, product-indicator and two-stage interactions, second-order factors; MLR robust layer (default estimator, as seminr): Huber-White sandwich SEs + Yuan-Bentler-Mplus scaled/robust fit columns (`src/cbsem/robust.ts`)
- Plotting (`src/plot/`): `plot()`/`dotGraph()` Graphviz-DOT path diagrams for spec-only/estimated/bootstrapped PLS and CBSEM/CFA models (DOT byte-identical to R seminr where R has them; CBSEM/CFA design shared with the py port), themes (`seminrThemeCreate` + default/academic/smart/dark, active-theme slot), `plotHtmt`, `savePlot`/`SeminrPlot.save` (svg/dot/gv), async SVG rendering via optional peer dep `@hpcc-js/wasm-graphviz`; chart plots as dependency-free SVG (`plotScores`, `plotReliabilityTable`, `slopeAnalysis`/`plotInteraction`, `plotPredictError` with R `bw.nrd0` KDE)
- Out of scope for now: FIML/missing data for CBSEM, raster plot export (PNG/PDF)

## Reference implementation

A completed Python port lives in the sibling repo `../seminr-py/` — many of its design decisions were made anticipating reuse here, so check its plans (`../seminr-py/.claude/plans/`) before re-deriving a solution the Python port already settled.

The R source of record is `../seminr/R/`. Key files: `estimate_simplePLS.R` (core algorithm), `estimate_pls.R`, `estimate_bootstrap.R`, `specify_constructs.R`, `specify_interactions.R`, `feature_higher_order.R`; for CBSEM: `estimate_cbsem.R`, `lavaan_syntax.R`, `compute_ten_berge.R` (the ML estimator itself replicates lavaan — formulas digested with file:line refs in `.claude/plans/PLAN.cbsem.md`). Numerical parity with seminr on the bundled `mobi` dataset is the acceptance bar — golden fixtures are generated from R (see plans; CBSEM fixtures use BFGS-polished lavaan optima, see plan Q7).

## Development

- TDD is mandatory: write failing tests before implementation (red → green). See the plan's task ordering.
- Toolchain is Bun exclusively: `bun install`, `bun test` (`bun:test`), `bun run`. TypeScript's `tsc` is used only for typechecking and emitting `dist/` (declarations) — no npm, no Node-specific tooling. Library code in `src/` must stay runtime-agnostic: no top-level `node:*`/`Bun.*` imports. Call-time dynamic imports of `node:*` or optional peer dependencies are allowed inside function bodies when the failure path throws a clear, browser-safe error (e.g. `savePlot`'s `node:fs/promises`, `renderSvg`'s `@hpcc-js/wasm-graphviz`). `tests/`, `demos/`, and `scripts/` may use Bun APIs.
- Keep the public API shaped like seminr's R API where idiomatic in TypeScript (e.g. `constructs()`, `composite()`, `relationships()`, `paths()`, `estimatePls()`, `bootstrapModel()`).
- Releasing: the version lives in **three** places that must match — `package.json`, `src/version.ts`, and the assertion in `tests/smoke.test.ts` (the git tag `vX.Y.Z` too). Bumping only `package.json` (as the 0.1.2 and 0.2.0 bumps did) ships a package whose runtime `version` export is stale. Always bump all three together, then merge via a release-branch PR (CI is the 3-OS matrix) before tagging; the `v*` tag push triggers the npm publish.

## Conventions

- Plans live in `.claude/plans/` (gitignored, synced across machines via Sideways).
- No AI coauthor references in commits, PRs, or issues.
