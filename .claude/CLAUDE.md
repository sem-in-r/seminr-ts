# semints

TypeScript implementation of PLS-SEM (Partial Least Squares Structural Equation Modeling) estimation, ported from the [seminr](https://github.com/sem-in-r/seminr) R package (sibling repo at `../seminr/`).

## Project Status

Greenfield. The authoritative plan for the initial implementation lives in `.claude/plans/PLAN.research-seminr.md` (referenced from `CLAUDE.local.md`). Read it before making changes.

## Scope (initial)

- Model specification DSL: constructs, composite/reflective measurement, relationships/paths, interaction terms, higher-order constructs
- PLS estimation (simplePLS algorithm: path weighting scheme, outer modes A/B)
- Bootstrapping (paths, loadings, weights; t-values and percentile CIs)
- Out of scope for now: CBSEM/CFA, PLSc (consistent PLS), plotting, PLSpredict, MGA

## Reference implementation

The R source of record is `../seminr/R/`. Key files: `estimate_simplePLS.R` (core algorithm), `estimate_pls.R`, `estimate_bootstrap.R`, `specify_constructs.R`, `specify_interactions.R`, `feature_higher_order.R`. Numerical parity with seminr on the bundled `mobi` dataset is the acceptance bar — golden fixtures are generated from R (see plan).

## Development

- TDD is mandatory: write failing tests before implementation (red → green). See the plan's task ordering.
- Package manager / test runner: see `package.json` once scaffolded (plan specifies Vitest).
- Keep the public API shaped like seminr's R API where idiomatic in TypeScript (e.g. `constructs()`, `composite()`, `relationships()`, `paths()`, `estimatePls()`, `bootstrapModel()`).

## Conventions

- Plans live in `.claude/plans/` (gitignored, synced across machines via Sideways).
- No AI coauthor references in commits, PRs, or issues.
