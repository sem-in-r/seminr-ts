/** Unconstrained quasi-Newton minimization (BFGS with backtracking line search). */

export interface BfgsOptions {
  fn: (x: number[]) => number;
  grad: (x: number[]) => number[];
  x0: readonly number[];
  /** Maximum BFGS iterations (default 1000). */
  maxIter?: number;
  /** Convergence: infinity norm of the gradient below this (default 1e-10). */
  gradTol?: number;
  /**
   * When progress stalls at double-precision limits (objective decrease below
   * ~1e-14 relative for several iterations, or the line search fails), the
   * run still counts as converged if the gradient norm is below this
   * (default 1e-6).
   */
  stallGradTol?: number;
}

export interface BfgsResult {
  x: number[];
  fx: number;
  gradNorm: number;
  iterations: number;
  converged: boolean;
}

const gradInfNorm = (g: readonly number[]) => g.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

export function bfgs(options: BfgsOptions): BfgsResult {
  const { fn, grad } = options;
  const maxIter = options.maxIter ?? 1000;
  const gradTol = options.gradTol ?? 1e-10;
  const stallGradTol = options.stallGradTol ?? 1e-6;
  const n = options.x0.length;

  let x = [...options.x0];
  let fx = fn(x);
  let g = grad(x);

  // Inverse Hessian approximation, initialized to identity.
  let h: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  let iterations = 0;
  let converged = gradInfNorm(g) < gradTol;
  let stalledIters = 0;

  while (!converged && iterations < maxIter) {
    // Search direction d = -H g
    const d = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += h[i]![j]! * g[j]!;
      d[i] = -s;
    }
    let slope = 0;
    for (let i = 0; i < n; i++) slope += d[i]! * g[i]!;
    if (slope >= 0) {
      // Not a descent direction (numerical breakdown) — reset to steepest descent.
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) h[i]![j] = i === j ? 1 : 0;
        d[i] = -g[i]!;
      }
      slope = -g.reduce((s, v) => s + v * v, 0);
      if (slope === 0) break;
    }

    // Backtracking line search (Armijo condition).
    const c1 = 1e-4;
    let t = 1;
    let xNew: number[] = x;
    let fNew = fx;
    let ok = false;
    for (let ls = 0; ls < 60; ls++) {
      xNew = x.map((xi, i) => xi + t * d[i]!);
      fNew = fn(xNew);
      if (fNew <= fx + c1 * t * slope) {
        ok = true;
        break;
      }
      t /= 2;
    }
    if (!ok) {
      // Line search failed: no further descent representable.
      converged = gradInfNorm(g) < stallGradTol;
      break;
    }
    if (fx - fNew <= 1e-14 * Math.max(1, Math.abs(fx))) {
      stalledIters++;
    } else {
      stalledIters = 0;
    }

    const gNew = grad(xNew);
    const s = xNew.map((v, i) => v - x[i]!);
    const yv = gNew.map((v, i) => v - g[i]!);
    let sy = 0;
    for (let i = 0; i < n; i++) sy += s[i]! * yv[i]!;

    if (sy > 1e-12) {
      // BFGS inverse update: H = (I - r s y')H(I - r y s') + r s s', r = 1/sy
      const r = 1 / sy;
      const hy = new Array<number>(n).fill(0);
      for (let i = 0; i < n; i++) {
        let acc = 0;
        for (let j = 0; j < n; j++) acc += h[i]![j]! * yv[j]!;
        hy[i] = acc;
      }
      let yhy = 0;
      for (let i = 0; i < n; i++) yhy += yv[i]! * hy[i]!;
      const hNew: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          hNew[i]![j] =
            h[i]![j]! -
            r * (s[i]! * hy[j]! + hy[i]! * s[j]!) +
            r * r * yhy * s[i]! * s[j]! +
            r * s[i]! * s[j]!;
        }
      }
      h = hNew;
    }

    x = xNew;
    fx = fNew;
    g = gNew;
    iterations++;
    converged = gradInfNorm(g) < gradTol;
    if (!converged && stalledIters >= 8) {
      // Objective decrease has hit double-precision limits.
      converged = gradInfNorm(g) < stallGradTol;
      break;
    }
  }

  return { x, fx, gradNorm: gradInfNorm(g), iterations, converged };
}
