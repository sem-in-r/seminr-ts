/** Structural model specification, mirroring seminr's relationships()/paths() (specify_relationships.R). */

export interface SMRow {
  source: string;
  target: string;
}

export type SMMatrix = SMRow[];

/** Named-argument form of {@link paths}, mirroring R's `paths(from = ..., to = ...)`. */
export interface PathsArgs {
  from: string | readonly string[];
  to: string | readonly string[];
}

/**
 * All source→target combinations, in R `expand.grid(from, to)` order
 * (the `from` vector varies fastest).
 */
export function paths(args: PathsArgs): SMRow[];
export function paths(from: string | readonly string[], to: string | readonly string[]): SMRow[];
export function paths(
  fromOrArgs: string | readonly string[] | PathsArgs,
  maybeTo?: string | readonly string[],
): SMRow[] {
  const named = typeof fromOrArgs === "object" && !Array.isArray(fromOrArgs);
  const from = named ? (fromOrArgs as PathsArgs).from : (fromOrArgs as string | readonly string[]);
  const to = named ? (fromOrArgs as PathsArgs).to : maybeTo!;
  const sources = typeof from === "string" ? [from] : from;
  const targets = typeof to === "string" ? [to] : to;
  const rows: SMRow[] = [];
  for (const target of targets) {
    for (const source of sources) rows.push({ source, target });
  }
  return rows;
}

/** Concatenate path groups into a structural model, as seminr's `relationships()`. */
export function relationships(...pathGroups: readonly (readonly SMRow[])[]): SMMatrix {
  return pathGroups.flat();
}
