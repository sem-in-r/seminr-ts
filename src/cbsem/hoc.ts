/**
 * Higher-order (second-order factor) loading merge, mirroring seminr's
 * combine_first_order_second_order_loadings_cbsem: item loadings from lambda,
 * plus rows for each first-order construct carrying its loading on the HOC
 * from beta.
 */

import { namedMatrix, type NamedMatrix } from "../math/matrix.ts";
import type { CbsemParTable } from "./partable.ts";
import type { StandardizedSolution } from "./standardize.ts";

/** First-order constructs serving as measurements of the given HOCs, in mm order. */
export function hocMeasureConstructs(pt: CbsemParTable, hocs: readonly string[]): string[] {
  const out: string[] = [];
  for (const fp of pt.freeParams) {
    if (fp.matrix === "beta" && fp.op === "=~" && hocs.includes(fp.lhs) && !out.includes(fp.rhs)) {
      out.push(fp.rhs);
    }
  }
  return out;
}

export function combineHocLoadings(
  pt: CbsemParTable,
  std: StandardizedSolution,
  hocs: readonly string[],
): NamedMatrix {
  const measures = hocMeasureConstructs(pt, hocs);
  const rows = [...pt.observed, ...measures];
  const values = std.lambda.map((row) => [...row]);
  for (const measure of measures) {
    values.push(new Array<number>(pt.latents.length).fill(0));
  }
  for (const fp of pt.freeParams) {
    if (fp.matrix === "beta" && fp.op === "=~" && hocs.includes(fp.lhs)) {
      const rowIdx = pt.observed.length + measures.indexOf(fp.rhs);
      values[rowIdx]![fp.col] = std.beta![fp.row]![fp.col]!;
    }
  }
  return namedMatrix(rows, [...pt.latents], values);
}
