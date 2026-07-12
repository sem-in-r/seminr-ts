/**
 * seminr-ts advanced math subpath (`@seminr/core/math`) — the low-level numeric
 * layer underlying PLS/CBSEM estimation, exposed for downstream packages (e.g.
 * `@seminr/extras`) that need the same primitives without deep-importing dist
 * internals.
 *
 * This is not the primary API surface; prefer the root `@seminr/core` barrel for
 * modeling. Use this subpath only for direct access to linear algebra, matrix
 * utilities, distributions, statistics, and optimization.
 */

// Row-major matrix primitives and name-addressable matrix wrapper
export * from "./matrix.ts";

// Linear solving (Gaussian elimination, OLS) and matrix inversion
export * from "./solve.ts";

// Symmetric eigendecomposition (cyclic Jacobi) and matrix powers
export * from "./eigen.ts";

// Cholesky factorization and derived operations
export * from "./cholesky.ts";

// Distribution functions (normal, chi-square, gamma)
export * from "./distributions.ts";

// Statistical primitives matching R semantics (mean/sd/cov/cor/quantile, standardization)
export * from "./stats.ts";

// Unconstrained quasi-Newton minimization (BFGS)
export * from "./optimize.ts";
