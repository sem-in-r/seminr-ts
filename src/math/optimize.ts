/**
 * Unconstrained quasi-Newton minimization: R's `optim(method = "BFGS")`.
 *
 * This is a delegation to `@compstats/core/stats`'s `optim`, which since its
 * 0.6.0 is **`vmmin` from R's own `src/main/optim.c`** — R Core's arrangement
 * of Nash (1990) algorithm 21, followed line for line, with R's step-reduction
 * line search, R's `reltol` stopping rule, R's inverse-Hessian resets and R's
 * accounting of `fncount`/`grcount`.
 *
 * **Plan 010 declined exactly this swap, and the reason it gave has since gone
 * away.** Through 0.5.0 `optim` *was* this file — the hand-rolled Armijo
 * backtracking routine written here, taken upstream — so delegating would have
 * moved where the same algorithm is maintained and nothing else, at the cost of
 * a fixture re-pin. 0.6.0 replaced it with R's routine, which turns the question
 * from "who maintains this" into a measurement, and the measurement is one-sided.
 *
 * **What decided it.** This package's CBSEM fixtures are pinned to **lavaan**,
 * not to this optimizer, so the question is not whether a swap moves numbers but
 * which routine lands closer to lavaan's optimum. Measured across all 51
 * fixture comparisons in `tests/cbsem/` (plan 011, task B4), against lavaan's
 * own estimates:
 *
 * | | closer to lavaan | worst mean relative difference | median ratio |
 * | --- | --- | --- | --- |
 * | the retired routine | 8 of 51 | 2.05e-5 | — |
 * | `vmmin` at `reltol = 1e-15` | **42 of 51** | **9.64e-6** | **0.675** |
 *
 * So the swap halves the worst fixture's distance from lavaan and cuts the
 * median by a third. That is the same argument the distributions won on in plan
 * 010 — delegate to the implementation that is pinned to the reference — and it
 * is why the two `Revisit only if…` conditions in the docstring this replaces
 * are both now met.
 *
 * **The controls are this package's, not R's, and that is deliberate.** R's
 * defaults are `reltol = sqrt(eps)` = 1.49e-8 and `maxit = 100`, tuned for a
 * general-purpose fit. Inheriting them is the trap upstream documents from this
 * repo's own report: the ECSI CBSEM fit stops 21 iterations early at a gradient
 * norm of 1.6e-5 instead of 1.5e-8, moving parameters by 2.5e-4 — five times the
 * fixture tolerance — while still reporting `convergence: 0`, because stopping
 * on `reltol` *is* convergence in R. The defaults below are the floor measured
 * on the real objectives: at `reltol = 1e-15` every CBSEM fit reaches the same
 * point `1e-16` reaches, so tightening further buys nothing.
 *
 * `gradTol` and `stallGradTol` are gone. They were the retired routine's own
 * stopping rules and `vmmin` has no equivalent — it stops on `reltol` alone —
 * so they are **refused with an error** rather than accepted and ignored, which
 * would be a silent behaviour change for a caller that set them on purpose.
 *
 * `tests/math/optimize.test.ts` pins R's `par`, `value` and **`counts`** on five
 * cases. The counts are the strongest check available: two integers cannot agree
 * by luck the way a converged `par` can.
 */

import { optim } from "@compstats/core/stats";

export interface BfgsOptions {
  fn: (x: number[]) => number;
  /**
   * The gradient. Left out, R's central finite differences at `ndeps = 1e-3`
   * stand in for it — coarse enough to show in the answer, so supply it where
   * it is available.
   */
  grad?: (x: number[]) => number[];
  x0: readonly number[];
  /** Maximum BFGS iterations, R's `maxit` (default 1000; R's own is 100). */
  maxIter?: number;
  /**
   * The relative improvement below which the run stops — `vmmin`'s **only**
   * stopping rule besides `maxIter`. A step whose
   * `|f - Fmin| <= reltol * (|Fmin| + reltol)` ends the run, and the run counts
   * as converged. Default 1e-15, the floor measured on this package's CBSEM
   * objectives; R's own default is `sqrt(eps)` = 1.49e-8 and is far too loose
   * for a fit whose fixtures assert at 1e-5.
   */
  reltol?: number;
  /**
   * The objective value below which the run stops whatever the relative
   * improvement, R's `abstol`. Default `-Infinity`, which never fires.
   */
  abstol?: number;
}

export interface BfgsResult {
  x: number[];
  fx: number;
  /**
   * The largest absolute gradient element at the last gradient `vmmin` asked
   * for, 0 when it asked for none. **Diagnostic only**: `vmmin` stops on
   * `reltol` and never on the gradient, so a converged run may leave this well
   * above zero.
   */
  gradNorm: number;
  /**
   * BFGS iterations, which is `counts.gradient - 1`: `vmmin` takes one gradient
   * at the start and one per iteration. Kept for the shape this interface has
   * had since 0.1; `counts` is the value to compare with R.
   */
  iterations: number;
  /** R's accounting of how often the objective and the gradient were asked for. */
  counts: { function: number; gradient: number };
  /** R's `convergence === 0`: the run stopped on `reltol` rather than `maxIter`. */
  converged: boolean;
}

/** The controls the retired hand-rolled routine had and `vmmin` does not. */
const RETIRED = ["gradTol", "stallGradTol"] as const;

export function bfgs(options: BfgsOptions): BfgsResult {
  for (const name of RETIRED) {
    if (name in options) {
      throw new TypeError(
        `bfgs: \`${name}\` is no longer a control. It was a stopping rule of the ` +
          "hand-rolled routine this replaced; R's vmmin stops on `reltol` alone. " +
          "Set `reltol` instead — and read its note before assuming a value.",
      );
    }
  }

  const result = optim([...options.x0], options.fn, {
    gr: options.grad,
    control: {
      maxit: options.maxIter ?? 1000,
      reltol: options.reltol ?? 1e-15,
      abstol: options.abstol ?? -Infinity,
    },
  });

  return {
    x: result.par,
    fx: result.value,
    gradNorm: result.gradNorm,
    iterations: result.counts.gradient - 1,
    counts: result.counts,
    converged: result.convergence === 0,
  };
}
