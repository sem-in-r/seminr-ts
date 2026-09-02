# Changelog

All notable changes to `@seminr/core`. The R package this ports keeps its own
history in [seminr's NEWS](https://github.com/sem-in-r/seminr).

## 0.5.0

### Breaking

* **Nine names are gone from the `@seminr/core/math` subpath**: `tCdf`,
  `lgamma`, `lowerRegGamma`, `incompleteBeta`, `jacobiEigenSym`, `quantile`,
  `solve`, `colCor` and `colCov`. Every one has an R-pinned counterpart in
  [`@compstats/core`](https://www.npmjs.com/package/@compstats/core) — `pt`,
  `logGamma`, `regularizedGammaP`, `incompleteBeta`, `eigenSymmetric` and
  `quantile` from `@compstats/core/stats`, `solve`, `cor` and `cov` from
  `@compstats/core/linalg` — so the migration is an import change, not a
  reimplementation.

  They existed for one downstream package, which has since moved off the
  subpath entirely. Only `tCdf` also lost its implementation; it had no caller
  inside this package at all. The other eight are still used internally and
  only stopped being *exported*.

  **`jacobiEigenSym` is the one to check before you swap it.** Ours clamps
  eigenvalues at `|lambda| <= n * eps * max|lambda|` to exactly zero and maps
  them to zero under a negative power (the Moore-Penrose convention), because
  without that a rounding artefact turns a ten Berge score into `NaN`.
  `eigenSymmetric` does not do this. R's `eigen()` does not either, so seminr
  and the other ports share the defect.

  The subpath does not become empty: the matrix vocabulary (`zeros`, `matmul`,
  `transpose`, `namedMatrix`, `nmGet`, `nmSet`), the CBSEM primitives
  (`inverse`, `ols`, `olsColumns`, `cholesky`, `logDetFromChol`, `cholInverse`,
  `symMatrixPower`, `bfgs`), the distributions still used internally, and the
  statistics layer all stay.

### Fixed

* **`standardize()` centred on the wrong one of R's means, and its scale came
  from the wrong function entirely.** Both are parity fixes against
  `standardize_safely` (`compute_safe.R:14-18`), and both were introduced by
  taking `@compstats/core` 0.7.0, whose `mean` is now R's corrected two-pass
  `do_mean` rather than `sum(x)/n`.

  `standardize_safely` centres on **`colMeans`** — R's uncorrected single pass
  (`do_colsum`, `src/main/array.c`) — and takes its scale from those same
  residuals, `sqrt(colSums(res * res) / (n - 1))`. It never calls `sd()`. This
  package was routing the centre through `mean` (correct only while `mean` was
  itself uncorrected) and the scale through `sd` (never correct: `sd` centres
  on the corrected mean).

  Measured against R 4.5.3 on the bundled `mobi` dataset: the centre moves on
  **8 of 24 columns** and the scale on **5 of 24**. Every PLS estimate runs
  through `standardize()`, so this reaches construct scores, weights and
  loadings — by ulps, which is exactly why no fixture caught it. A new
  `colMean` export is the uncorrected pass, and
  `tests/math/arith-conformance.test.ts` pins all three of R's means as exact
  doubles rather than to a tolerance.

* **`colMeans` sites elsewhere, found by the same audit.**
  `src/predict/predict.ts` ports `feature_plspredict.R:206-207`, which *splits*:
  `colMeans` for the centre and `stats::sd` for the scale, on adjacent lines.
  `src/cbsem/tenBerge.ts` ports `estimate_factor_scores.R:41`
  (`i.means <- colMeans(X)`), and `src/cbsem/sigma.ts` ports lavaan's sample
  statistics, which centre on `base::colMeans`. All three now use `colMean`.

* **`desc()` takes the centre from its caller**, because in R the choice is
  made by the *storage mode* of the argument. `report_descriptives.R:4` passes
  raw item data — and every bundled seminr dataset is an **integer** frame, on
  which R's `mean` takes `do_mean`'s INTSXP branch and has no correcting pass —
  while `:7` passes construct scores, which are doubles. The same R call is two
  different functions. `kurt` and `skew` follow whichever centre is chosen.

* **Two-sided p-values in the CBSEM solution tables no longer subtract.**
  `2 * (1 - pnorm(|z|))` is exactly 0 from `|z| = 9` upward, where the
  probability is 2.26e-19 and still falling. `2 * pnorm(-|z|)` computes it
  directly, and is bit-identical to R's `2 * pnorm(abs(z), lower.tail = FALSE)`
  at every point tested from `|z| = 0.5` to 50. This is the same deliberate
  departure from the reference that `chisqUpperTail` already makes: lavaan
  subtracts too, and so reports 0 where this now reports a number. Nothing
  reading a p-value as a decision at 0.05, 0.01 or 0.001 can tell the
  difference.

### Changed

* **`@compstats/core` moved to `^0.7.0`** (from `^0.6.1`). Its `mean` and `sd`
  are now R's corrected forms, so every site that ports R's `mean()` over a
  double vector — bootstrap replicate means and SDs, PLS-MGA group means, the
  inner weighting scheme's hoisted `cov`/`cor`, PLSpredict's error metrics —
  now **computes the function R computes**, where before it computed
  `sum(x)/n`. No fixture needed re-pinning.

  **That is a claim about each site's arithmetic, not about composite
  parity, and the two are not the same claim.** A downstream port measured
  the difference across 1574 `pathCoef` and `outerWeights` cells against R
  goldens, before and after taking this release: 244 moved, **117 closer to R
  and 113 farther**, exact-match cells up from 57 to 61, mean absolute
  residual 2.223e-17 → 2.160e-17, and worst-case residual 8.882e-16 →
  1.332e-15. Nine orders of magnitude inside their 1e-5 tolerance, so nothing
  was at risk — but at the aggregate the change is a wash, not an
  improvement.

  This is what you should expect once a residual sits at the double-precision
  floor. A construct score passes through many operations whose association
  orders still differ from R's, so which way the composite lands is decided by
  rounding elsewhere in the chain rather than by the corrected mean. Fixing an
  operation to match R makes that operation right; it does not make an estimate
  built from a hundred of them converge. Reported by the `seminrExtras-ts`
  port, whose measurement this is.

  If you depend on both packages, this release also ends a nested install:
  while `@seminr/core` pinned `^0.6.1` and you pinned `^0.7.0`, npm and bun
  installed *both*, and anything reached through this package's facade returned
  the pre-fix value from a tree that looked upgraded. `npm ls @compstats/core`
  is the only thing that shows it.

### Added

* **`colMean`** on `@seminr/core/math` — R's `colMeans()`, the uncorrected
  single pass, alongside the corrected `mean`. Its docstring carries the
  three-mean table and the storage-mode rule, and every call site in `src/` now
  names the R function it ports. That naming convention is the actual
  deliverable here: the same defect — a `colMeans` site routed through
  `mean.default` — has now been found in three separate packages, and it looks
  correct every time *because the name matches*.

* `scripts/generate-arith-fixtures.R`, a conformance generator pinning all
  three of R's means, `sd` and `var` as exact doubles. It records
  `capabilities("long.double")` and the test asserts it first: exact comparison
  is only sound where R's `LDOUBLE` accumulators are plain doubles. Its
  synthetic vector is chosen by a seed sweep *because* the naive mean fails on
  it — a fixture picked for convenience stays green through the entire life of
  the bug it was meant to catch, which is how this class of defect survived
  three packages.
