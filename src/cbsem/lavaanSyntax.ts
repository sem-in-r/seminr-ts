/**
 * lavaan model-syntax generation from mmMatrix/smMatrix/associations,
 * mirroring seminr's lavaan_syntax.R rules exactly (string-for-string).
 */

import type { MmMatrix } from "../model/mmMatrix.ts";
import type { SmMatrix } from "../model/smMatrix.ts";
import {
  associationPairs,
  hasAssociations,
  type ItemAssociations,
} from "../specify/associations.ts";

/** Make a construct/item name lavaan-safe: `*` -> `_x_`. */
export function lavaanifyName(name: string): string {
  return name.replaceAll("*", "_x_");
}

/** Reverse of {@link lavaanifyName} for reporting. */
export function unlavaanifyName(name: string): string {
  return name.replaceAll("_x_", "*");
}

function lavaanConstruct(construct: string, mmMatrix: MmMatrix): string {
  const lavName = lavaanifyName(construct);
  if (!mmMatrix.isReflective(construct)) {
    throw new Error(`${lavName} must be a reflective construct for a CBSEM model`);
  }
  const items = mmMatrix.constructItems(construct).map(lavaanifyName);
  const lines = [`${lavName} =~ ${items.join(" + ")}`];
  if (mmMatrix.isSingleItem(construct)) {
    // constrain error for single item constructs
    lines.push(`${items[0]} ~~ 0*${items[0]}`);
  }
  return lines.join("\n");
}

/** `# Latent Variable Definitions` block. */
export function lavaanMmSyntax(mmMatrix: MmMatrix): string {
  const blocks = mmMatrix.allConstructs().map((c) => lavaanConstruct(c, mmMatrix));
  return `# Latent Variable Definitions\n${blocks.join("\n")}`;
}

function lavaanRegression(outcome: string, sm: SmMatrix): string {
  const antecedents = sm.constructAntecedents(outcome).map(lavaanifyName);
  return `${lavaanifyName(outcome)} ~ ${antecedents.join(" + ")}`;
}

/** `# Regressions` block. */
export function lavaanSmSyntax(sm: SmMatrix): string {
  const lines = sm.allEndogenous().map((outcome) => lavaanRegression(outcome, sm));
  return `# Regressions\n${lines.join("\n")}`;
}

/** `# Residual Covariances` block, or null when there are no associations. */
export function lavaanItemAssociations(
  itemAssociations: ItemAssociations | undefined | null,
): string | null {
  if (!hasAssociations(itemAssociations)) return null;
  const lines = associationPairs(itemAssociations).map(([a, b]) => `${a} ~~ ${b}`);
  return `# Residual Covariances\n${lines.join("\n")}`;
}

export interface LavaanModelParts {
  mmMatrix: MmMatrix;
  structuralModel?: SmMatrix;
  itemAssociations?: ItemAssociations | null;
}

/**
 * Full lavaan model: blocks joined by blank lines. Mirrors seminr's
 * paste(measurement, [structural,] associations, sep="\n\n") exactly — a NULL
 * associations block still contributes its separator (trailing "\n\n"), as R
 * paste() recycles the zero-length argument to "".
 */
export function lavaanModelSyntax(parts: LavaanModelParts): string {
  const blocks: string[] = [lavaanMmSyntax(parts.mmMatrix)];
  if (parts.structuralModel && !parts.structuralModel.isEmpty()) {
    blocks.push(lavaanSmSyntax(parts.structuralModel));
  }
  blocks.push(lavaanItemAssociations(parts.itemAssociations) ?? "");
  return blocks.join("\n\n");
}
