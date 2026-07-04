/**
 * lavaan model-syntax generation from mmMatrix/smMatrix/associations,
 * mirroring seminr's lavaan_syntax.R rules exactly (string-for-string).
 */

import type { MMMatrix } from "../model/mmMatrix.ts";
import { allConstructs, constructItems, isReflective, isSingleItem } from "../model/mmMatrix.ts";
import type { SMMatrix } from "../specify/relationships.ts";
import { allEndogenous, constructAntecedents } from "../model/smMatrix.ts";
import type { ItemAssociations } from "../specify/associations.ts";

/** Make a construct/item name lavaan-safe: `*` -> `_x_`. */
export function lavaanifyName(name: string): string {
  return name.replaceAll("*", "_x_");
}

/** Reverse of {@link lavaanifyName} for reporting. */
export function unlavaanifyName(name: string): string {
  return name.replaceAll("_x_", "*");
}

function lavaanConstruct(construct: string, mmMatrix: MMMatrix): string {
  const lavName = lavaanifyName(construct);
  if (!isReflective(mmMatrix, construct)) {
    throw new Error(`${lavName} must be a reflective construct for a CBSEM model`);
  }
  const items = constructItems(mmMatrix, construct).map(lavaanifyName);
  const lines = [`${lavName} =~ ${items.join(" + ")}`];
  if (isSingleItem(mmMatrix, construct)) {
    // constrain error for single item constructs
    lines.push(`${items[0]} ~~ 0*${items[0]}`);
  }
  return lines.join("\n");
}

/** `# Latent Variable Definitions` block. */
export function lavaanMmSyntax(mmMatrix: MMMatrix): string {
  const blocks = allConstructs(mmMatrix).map((c) => lavaanConstruct(c, mmMatrix));
  return `# Latent Variable Definitions\n${blocks.join("\n")}`;
}

function lavaanRegression(outcome: string, sm: SMMatrix): string {
  const antecedents = constructAntecedents(sm, outcome).map(lavaanifyName);
  return `${lavaanifyName(outcome)} ~ ${antecedents.join(" + ")}`;
}

/** `# Regressions` block. */
export function lavaanSmSyntax(sm: SMMatrix): string {
  const lines = allEndogenous(sm).map((outcome) => lavaanRegression(outcome, sm));
  return `# Regressions\n${lines.join("\n")}`;
}

/** `# Residual Covariances` block, or null when there are no associations. */
export function lavaanItemAssociations(
  itemAssociations: ItemAssociations | undefined | null,
): string | null {
  if (!itemAssociations || itemAssociations.length === 0) return null;
  const lines = itemAssociations.map(([a, b]) => `${a} ~~ ${b}`);
  return `# Residual Covariances\n${lines.join("\n")}`;
}

export interface LavaanModelParts {
  mmMatrix: MMMatrix;
  structuralModel?: SMMatrix;
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
  if (parts.structuralModel && parts.structuralModel.length > 0) {
    blocks.push(lavaanSmSyntax(parts.structuralModel));
  }
  blocks.push(lavaanItemAssociations(parts.itemAssociations) ?? "");
  return blocks.join("\n\n");
}
