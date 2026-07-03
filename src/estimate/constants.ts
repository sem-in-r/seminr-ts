/** Numeric constants shared across estimation (seminr defaults). */

/** Maximum simplePLS iterations (estimate_simplePLS.R default). */
export const DEFAULT_MAX_IT = 300;

/** Convergence exponent: converged when sum|Δweights| < 10^-stopCriterion. */
export const DEFAULT_STOP_CRITERION = 7;

/** Warn when more than this share of a column is missing (clean_data.R). */
export const MISSING_WARNING_SHARE = 0.05;

/** Tolerance used by R-parity tests. */
export const PARITY_TOLERANCE = 1e-5;
