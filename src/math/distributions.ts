/** Distribution functions needed for SEM inference (normal, chi-square). */

// Lanczos approximation (g = 7, n = 9), ~15 significant digits.
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** log Gamma(x) for x > 0. */
export function lgamma(x: number): number {
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0]!;
  const t = z + 7.5;
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a, x) via series / continued fraction. */
export function lowerRegGamma(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    // Series representation.
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let i = 0; i < 1000; i++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  // Continued fraction for Q(a, x) (modified Lentz).
  const fpmin = 1e-300;
  let b = x + 1 - a;
  let c = 1 / fpmin;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = b + an / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  return 1 - q;
}

/**
 * Continued-fraction expansion for the regularized incomplete beta function
 * (Numerical Recipes `betacf`, modified Lentz). Converges fast when x is below
 * the distribution's mode; {@link incompleteBeta} arranges that via symmetry.
 */
function betacf(a: number, b: number, x: number): number {
  const fpmin = 1e-300;
  const eps = 3e-16;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

/**
 * Regularized incomplete beta function I_x(a, b) (R's `pbeta`), via the
 * Numerical Recipes continued fraction on `lgamma`. The symmetry
 * I_x(a,b) = 1 − I_{1−x}(b,a) selects the fast-converging branch when
 * x > (a+1)/(a+b+2).
 */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Student-t CDF (R pt(x, df)) via the incomplete beta function. */
export function tCdf(x: number, df: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;
  if (x === 0) return 0.5;
  const p = incompleteBeta(df / (df + x * x), df / 2, 0.5) / 2;
  return x < 0 ? p : 1 - p;
}

/** Standard normal CDF (R pnorm). */
export function normalCdf(x: number): number {
  if (x === 0) return 0.5;
  const p = lowerRegGamma(0.5, (x * x) / 2);
  return x > 0 ? 0.5 + 0.5 * p : 0.5 - 0.5 * p;
}

/** Central chi-square CDF (R pchisq(x, df)). */
export function chisqCdf(x: number, df: number): number {
  if (x <= 0) return 0;
  return lowerRegGamma(df / 2, x / 2);
}

/**
 * Noncentral chi-square CDF (R pchisq(x, df, ncp)): Poisson-weighted mixture
 * of central chi-square CDFs.
 */
export function noncentralChisqCdf(x: number, df: number, ncp: number): number {
  if (ncp === 0) return chisqCdf(x, df);
  if (x <= 0) return 0;
  const lambda = ncp / 2;
  // Sum j over the effective support of Poisson(lambda).
  let sum = 0;
  let logWeight = -lambda; // log of Poisson pmf at j=0
  for (let j = 0; j < 10000; j++) {
    if (j > 0) logWeight += Math.log(lambda) - Math.log(j);
    const weight = Math.exp(logWeight);
    if (weight > 1e-18) {
      sum += weight * lowerRegGamma(df / 2 + j, x / 2);
    } else if (j > lambda) {
      break; // past the Poisson mode and negligible
    }
  }
  return Math.min(1, Math.max(0, sum));
}
