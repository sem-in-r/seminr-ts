# semints

TypeScript implementation of PLS-SEM (Partial Least Squares Structural Equation Modeling) estimation, ported from the [seminr](https://github.com/sem-in-r/seminr) R package (sibling repo at `../seminr/`).

## Project Status

Initial implementation complete: full R-parity test suite (fixtures generated from seminr), Bun/browser dual-runtime support, and seminr-style demos. The plan for that work — including the seminr reference digest and all findings — lives in `.claude/plans/PLAN.research-seminr.md` (referenced from `CLAUDE.local.md`). Read it before making changes.

## Scope (implemented)

- Model specification DSL: constructs, composite/reflective measurement, relationships/paths, interaction terms (product indicator, orthogonal, two-stage), higher-order constructs (two-stage); named-argument call forms mirroring seminr
- PLS estimation (simplePLS algorithm: path weighting/factorial schemes, outer modes A/B/UNIT) with PLSc correction for reflective constructs
- Bootstrapping (paths, loadings, weights, total effects; t-values and percentile CIs; injectable resampler; sequential + Web Worker parallel)
- Out of scope for now: CBSEM/CFA, HTMT and the model-evaluation/reliability metrics suite, plotting, PLSpredict, MGA

## Reference implementation

The R source of record is `../seminr/R/`. Key files: `estimate_simplePLS.R` (core algorithm), `estimate_pls.R`, `estimate_bootstrap.R`, `specify_constructs.R`, `specify_interactions.R`, `feature_higher_order.R`. Numerical parity with seminr on the bundled `mobi` dataset is the acceptance bar — golden fixtures are generated from R (see plan).

## Development

- TDD is mandatory: write failing tests before implementation (red → green). See the plan's task ordering.
- Toolchain is Bun exclusively: `bun install`, `bun test` (`bun:test`), `bun run`. TypeScript's `tsc` is used only for typechecking and emitting `dist/` (declarations) — no npm, no Node-specific tooling. Library code in `src/` must stay runtime-agnostic (no `node:*`/`Bun.*` imports); `tests/`, `demos/`, and `scripts/` may use Bun APIs.
- Keep the public API shaped like seminr's R API where idiomatic in TypeScript (e.g. `constructs()`, `composite()`, `relationships()`, `paths()`, `estimatePls()`, `bootstrapModel()`).

## Conventions

- Plans live in `.claude/plans/` (gitignored, synced across machines via Sideways).
- No AI coauthor references in commits, PRs, or issues.
