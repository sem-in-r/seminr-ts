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
 * (`normalCdf`, `chisqCdf`, `noncentralChisqCdf`, `tCdf`, `lgamma`,
 * `lowerRegGamma`, `incompleteBeta`) and the summaries (`mean`, `sd`,
 * `quantile`) are thin delegations — those are ports of R's own `nmath` sources
 * and of `quantile(type = 7)`, pinned to R by conformance fixtures, where the
 * code they replaced was Lanczos, Numerical Recipes and a paraphrase of R's
 * interpolation. Everything else here stays seminr-ts's own: the matrix
 * vocabulary, the solvers, the eigen and Cholesky routines, and — deliberately —
 * the BFGS optimizer, for the reasons written into `optimize.ts`.
 *
 * Names delegated from `@compstats/core` carry explicit type annotations at the
 * point of definition; see `tests/math/compstats-types.test.ts` for why that is
 * a rule rather than a style.
 */

// Row-major matrix primitives and name-addressable matrix wrapper
export { zeros, matmul, transpose, namedMatrix, nmGet, nmSet } from "./matrix.ts";
export type { Matrix, NamedMatrix } from "./matrix.ts";

// Linear solving (Gaussian elimination, OLS) and matrix inversion
export { solve, inverse, ols, olsColumns } from "./solve.ts";

// Symmetric eigendecomposition (cyclic Jacobi) and matrix powers
export { jacobiEigenSym, symMatrixPower } from "./eigen.ts";
export type { EigenSym } from "./eigen.ts";

// Cholesky factorization and derived operations
export { cholesky, logDetFromChol, cholInverse } from "./cholesky.ts";

// Distribution functions (normal, chi-square, t, gamma, beta)
export {
  lgamma,
  lowerRegGamma,
  incompleteBeta,
  tCdf,
  normalCdf,
  chisqCdf,
  noncentralChisqCdf,
} from "./distributions.ts";

// Statistical primitives matching R semantics (mean/sd/cov/cor/quantile, standardization)
export {
  mean,
  sd,
  standardize,
  standardizeInPlace,
  cov,
  cor,
  colCov,
  colCor,
  centerColumns,
  corFromCentered,
  quantile,
} from "./stats.ts";
export type { Standardized, CenteredColumns } from "./stats.ts";

// Unconstrained quasi-Newton minimization (BFGS)
export { bfgs } from "./optimize.ts";
export type { BfgsOptions, BfgsResult } from "./optimize.ts";
