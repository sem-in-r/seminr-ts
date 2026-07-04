/**
 * CBSEM/CFA quality metrics mirroring seminr: composite reliability rhoC and
 * AVE from standardized loadings (compute_metrics.R), and antecedent VIFs
 * from construct correlations (evaluate_validity.R).
 */

import { namedMatrix, nmGet, type NamedMatrix } from "../math/matrix.ts";
import { inverse } from "../math/solve.ts";
import type { SmMatrix } from "../model/smMatrix.ts";

/**
 * rhoC = (Σλ)² / ((Σλ)² + Σ(1−λ²)), AVE = Σλ²/n over each construct's
 * nonzero standardized loadings; single-indicator constructs are 1/1.
 */
export function rhoCAve(factorLoadings: NamedMatrix, constructs: readonly string[]): NamedMatrix {
  const values = constructs.map((construct) => {
    const col = factorLoadings.cols.indexOf(construct);
    const lambdas = factorLoadings.values
      .map((row) => row[col]!)
      .filter((v) => v !== 0);
    if (lambdas.length <= 1) return [1, 1];
    const sum = lambdas.reduce((a, b) => a + b, 0);
    const sumSq = lambdas.reduce((a, b) => a + b * b, 0);
    const rhoC = (sum * sum) / (sum * sum + lambdas.reduce((a, b) => a + (1 - b * b), 0));
    const ave = sumSq / lambdas.length;
    return [rhoC, ave];
  });
  return namedMatrix([...constructs], ["rhoC", "AVE"], values);
}

/**
 * VIF of each antecedent per endogenous construct, from the construct
 * correlation matrix: diag of the inverse of the antecedent sub-correlation
 * matrix. Single-antecedent outcomes get NaN (seminr's NA).
 */
export function antecedentVifs(
  sm: SmMatrix,
  corLv: NamedMatrix,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const outcome of sm.allEndogenous()) {
    const antecedents = sm.constructAntecedents(outcome);
    const byAntecedent: Record<string, number> = {};
    if (antecedents.length === 1) {
      byAntecedent[antecedents[0]!] = Number.NaN;
    } else {
      const sub = antecedents.map((a) => antecedents.map((b) => nmGet(corLv, a, b)));
      const inv = inverse(sub);
      antecedents.forEach((a, i) => {
        byAntecedent[a] = inv[i]![i]!;
      });
    }
    out[outcome] = byAntecedent;
  }
  return out;
}
