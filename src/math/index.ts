/**
 * seminr-ts advanced math subpath (`@seminr/core/math`) — the low-level numeric
 * layer underlying PLS/CBSEM estimation, exposed for downstream packages (e.g.
 * `@seminr/extras`) that need the same primitives without deep-importing dist
 * internals.
 *
 * This is not the primary API surface; prefer the root `@seminr/core` barrel for
 * modeling. Use this subpath only for direct access to linear algebra, matrix
 * utilities, distributions, statistics, and optimization.
 *
 * Every name is re-exported explicitly rather than through `export *`, so the
 * public surface is a written list: swapping an implementation for a delegation
 * to `@compstats/core` is then invisible to importers, and widening the surface
 * by accident is impossible. `tests/math/facade.test.ts` pins the list.
 *
 * **What is delegated to `@compstats/core`, and what is not.** The distributions
 * (`normalCdf`, `chisqCdf`, `noncentralChisqCdf`) and the summaries (`mean`,
 * `sd`) are thin delegations — ports of R's own `nmath` sources, pinned to R by
 * conformance fixtures, where the code they replaced was Lanczos and Numerical
 * Recipes. Everything else here stays seminr-ts's own: the matrix vocabulary,
 * the solvers, the eigen and Cholesky routines, `colMean`, and — deliberately —
 * the BFGS optimizer, for the reasons written into `optimize.ts`.
 *
 * **`mean` and `colMean` are both here on purpose.** They are two different R
 * functions — `do_mean`'s corrected second pass and `do_colsum`'s single one —
 * and which one a call site wants depends on the R line it ports *and*, for
 * `mean`, on the storage mode of R's argument there. `stats.ts`'s `colMean`
 * docstring is the reference; do not unify them.
 *
 * **Nine names were retired in 0.5.0** — `tCdf`, `lgamma`, `lowerRegGamma`,
 * `incompleteBeta`, `jacobiEigenSym`, `quantile`, `solve`, `colCor`, `colCov`.
 * They existed for `seminrExtras-ts`, which now takes them from
 * `@compstats/core` directly. Only `tCdf` lost its implementation; the rest are
 * still used internally and merely stopped being exported.
 *
 * Names delegated from `@compstats/core` carry explicit type annotations at the
 * point of definition; see `tests/math/compstats-types.test.ts` for why that is
 * a rule rather than a style.
 */

// Row-major matrix primitives and name-addressable matrix wrapper
export { zeros, matmul, transpose, namedMatrix, nmGet, nmSet } from "./matrix.ts";
export type { Matrix, NamedMatrix } from "./matrix.ts";

// Linear solving (Gaussian elimination, OLS) and matrix inversion
export { inverse, ols, olsColumns } from "./solve.ts";

// Symmetric eigendecomposition (cyclic Jacobi) and matrix powers
export { symMatrixPower } from "./eigen.ts";
export type { EigenSym } from "./eigen.ts";

// Cholesky factorization and derived operations
export { cholesky, logDetFromChol, cholInverse } from "./cholesky.ts";

// Distribution functions (normal, chi-square, t, gamma, beta)
export {
  normalCdf,
  chisqCdf,
  noncentralChisqCdf,
  chisqUpperTail,
  noncentralChisqUpperTail,
} from "./distributions.ts";

// Statistical primitives matching R semantics (mean/sd/cov/cor/quantile, standardization)
export {
  mean,
  colMean,
  sd,
  standardize,
  standardizeInPlace,
  cov,
  cor,
  centerColumns,
  corFromCentered,
} from "./stats.ts";
export type { Standardized, CenteredColumns } from "./stats.ts";

// Unconstrained quasi-Newton minimization (BFGS)
export { bfgs } from "./optimize.ts";
export type { BfgsOptions, BfgsResult } from "./optimize.ts";
