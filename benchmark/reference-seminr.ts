/**
 * seminr reference timings, transcribed verbatim from seminr's own performance
 * report (`../seminr/.claude/_archive/PLAN.performance.report.html`, PR #419).
 *
 * These were measured with `../seminr/bench/benchmark.R` at:
 *   Machine : Apple M1 Pro, 10 cores, 32 GB · macOS (Darwin 25.4.0)
 *   R       : 4.5.3, aarch64 · R-bundled reference BLAS/LAPACK
 *   Params  : reps 5 (long ops 3 or 1), nboot 200, folds 10, largeN 2000
 *   baseline: develop @ b9410fe (seminr 2.5.0.9000)
 *   after   : performance branch (bit-identical outputs)
 *
 * `benchmark/run.ts` reproduces the SAME scenarios with semints on Bun and puts
 * these three numbers (seminr baseline, seminr optimized, semints) side by side.
 * The scenario keys must stay in sync with the SCENARIOS list in run.ts.
 */

export interface SeminrRef {
  /** median seconds on seminr `develop` (pre-optimization). */
  baseline: number;
  /** median seconds on seminr `performance` branch (optimized). */
  optimized: number;
}

/** Keyed by the scenario `key` used in run.ts. */
export const SEMINR_REFERENCE: Record<string, SeminrRef> = {
  estimate_composite: { baseline: 0.007, optimized: 0.006 },
  estimate_plsc: { baseline: 0.009, optimized: 0.007 },
  estimate_largeN: { baseline: 0.025, optimized: 0.018 },
  bootstrap: { baseline: 2.989, optimized: 1.436 },
  bootstrap_parallel: { baseline: 1.625, optimized: 0.929 },
  boot_summary: { baseline: 0.028, optimized: 0.024 },
  predict_kfold: { baseline: 0.55, optimized: 0.212 },
  predict_loocv: { baseline: 12.351, optimized: 4.258 },
  mga: { baseline: 5.93, optimized: 2.681 },
  bootstrap_interaction: { baseline: 6.32, optimized: 3.969 },
};

export const SEMINR_ENV = {
  machine: "Apple M1 Pro, 10 cores, 32 GB",
  os: "macOS (Darwin 25.4.0)",
  runtime: "R 4.5.3 (aarch64), R-bundled reference BLAS/LAPACK",
  baselineCommit: "b9410fe (develop, seminr 2.5.0.9000)",
  optimizedRef: "performance branch, PR #419",
} as const;
