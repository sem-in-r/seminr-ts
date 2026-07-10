/**
 * R-style number-to-string formatting for DOT output.
 *
 * R's `paste0`/`glue` coerce doubles with up to 15 significant digits and
 * trailing zeros trimmed — exactly C's `%.15g`. JavaScript has no printf `%g`
 * (`toPrecision` switches to exponential at a different threshold), so `rNum`
 * assembles it by hand. All numbers interpolated into DOT strings must go
 * through `rNum` for string parity with seminr.
 */

/** C `%.<precision>g`: significant-digit formatting with trailing-zero strip. */
function gFormat(value: number, precision: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "Inf" : "-Inf";
  if (value === 0) return Object.is(value, -0) ? "-0" : "0";

  const sign = value < 0 ? "-" : "";
  // toExponential is correctly rounded, so this yields the %g digit string.
  const [mantissa, expPart] = Math.abs(value)
    .toExponential(precision - 1)
    .split("e") as [string, string];
  const exp = Number.parseInt(expPart, 10);
  const digits = mantissa.replace(".", "");

  if (exp >= -4 && exp < precision) {
    let body: string;
    if (exp >= 0) {
      const intPart = digits.slice(0, exp + 1);
      const fracPart = digits.slice(exp + 1).replace(/0+$/, "");
      body = fracPart ? `${intPart}.${fracPart}` : intPart;
    } else {
      const fracPart = "0".repeat(-exp - 1) + digits;
      body = `0.${fracPart.replace(/0+$/, "")}`;
    }
    return sign + body;
  }

  const mantDigits = digits.replace(/0+$/, "") || "0";
  const mant =
    mantDigits.length > 1 ? `${mantDigits[0]}.${mantDigits.slice(1)}` : mantDigits;
  const expSign = exp < 0 ? "-" : "+";
  const expDigits = String(Math.abs(exp)).padStart(2, "0");
  return `${sign}${mant}e${expSign}${expDigits}`;
}

/** Format a number the way R's `paste0` renders a double (`%.15g`). */
export function rNum(value: number): string {
  return gFormat(value, 15);
}

/**
 * R's `round(x, digits)`: round to `digits` decimals by the value's exact
 * binary expansion with ties to even (what R and Python's `round` produce;
 * `toFixed` breaks ties upward instead).
 */
export function rRound(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  if (x === 0) return x;

  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const bits = view.getBigUint64(0);
  const expBits = Number((bits >> 52n) & 0x7ffn);
  const mantBits = bits & 0xfffffffffffffn;
  // |x| = mant * 2^e2, exactly
  const mant = expBits === 0 ? mantBits : mantBits | (1n << 52n);
  const e2 = (expBits === 0 ? 1 : expBits) - 1075;

  const p10 = 10n ** BigInt(digits);
  // |x| * 10^digits as the exact fraction num/den
  const num = e2 >= 0 ? mant * (1n << BigInt(e2)) * p10 : mant * p10;
  const den = e2 >= 0 ? 1n : 1n << BigInt(-e2);

  const q = num / den;
  const r = num % den;
  const twice = r * 2n;
  const rounded = twice > den || (twice === den && (q & 1n) === 1n) ? q + 1n : q;
  const result = Number(rounded) / Number(p10);
  return x < 0 ? -result : result;
}

export interface PvalrOptions {
  sigLimit?: number;
  digits?: number;
  html?: boolean;
}

/**
 * Format a p-value with an equal/less-than sign, as seminr's `pvalr`
 * (plot_utils.R:28): full digits below .10, two digits above, `< sigLimit`
 * when under the reporting floor.
 */
export function pvalr(pval: number, options: PvalrOptions = {}): string {
  const { sigLimit = 0.001, digits = 3, html = false } = options;

  const roundr = (x: number, d: number): string => {
    let res = x.toFixed(d);
    const zzz = `0.${"0".repeat(d)}`;
    if (res === `-${zzz}`) res = zzz;
    return `= ${res}`;
  };

  if (pval < sigLimit) {
    const limit = gFormat(sigLimit, 6);
    return html ? `&lt; ${limit}` : `< ${limit}`;
  }
  if (pval > 0.1) return roundr(pval, 2);
  return roundr(pval, digits);
}

/** Significance stars for a p-value, as seminr's `psignr` (plot_utils.R:61). */
export function psignr(
  pval: number,
  sigLimits: readonly number[] = [0.05, 0.01, 0.001],
): string {
  if (Number.isNaN(pval)) return "";
  return "*".repeat(sigLimits.filter((limit) => pval < limit).length);
}
