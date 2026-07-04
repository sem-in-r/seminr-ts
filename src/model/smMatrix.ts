/** Structural-model matrix value type and accessors (helpers-smMatrix.R). */

import type { SMRow } from "../specify/relationships.ts";

/** Structural-model input: DSL rows from `relationships()` or an SmMatrix instance. */
export type SmMatrixInput = SmMatrix | readonly Readonly<SMRow>[];

/** A construct name denotes an interaction when it contains `*`. */
export function isInteraction(constructName: string): boolean {
  return constructName.includes("*");
}

function unique(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Immutable value type for the structural-model matrix. All reads go through
 * seminr-named accessor methods (helpers-smMatrix.R); transforms return new
 * instances. `toRows`/`fromRows` are the escape hatches for serialization,
 * worker boundaries, and fixture comparisons.
 */
export class SmMatrix {
  private constructor(private readonly rows: readonly Readonly<SMRow>[]) {}

  static fromRows(rows: readonly Readonly<SMRow>[]): SmMatrix {
    return new SmMatrix([...rows]);
  }

  /** Normalize plain rows or an existing instance to an instance. */
  static from(x: SmMatrixInput): SmMatrix {
    return x instanceof SmMatrix ? x : SmMatrix.fromRows(x);
  }

  toRows(): readonly Readonly<SMRow>[] {
    return this.rows;
  }

  /** Serializes as the plain row array (fixtures, logging, structured clone). */
  toJSON(): readonly Readonly<SMRow>[] {
    return this.rows;
  }

  isEmpty(): boolean {
    return this.rows.length === 0;
  }

  /** Unique targets. */
  allEndogenous(): string[] {
    return unique(this.rows.map((r) => r.target));
  }

  /** Unique sources. */
  allExogenous(): string[] {
    return unique(this.rows.map((r) => r.source));
  }

  /** Sources that are never targets. */
  onlyExogenous(): string[] {
    const targets = new Set(this.rows.map((r) => r.target));
    return this.allExogenous().filter((c) => !targets.has(c));
  }

  /** Targets that are never sources. */
  onlyEndogenous(): string[] {
    const sources = new Set(this.rows.map((r) => r.source));
    return this.allEndogenous().filter((c) => !sources.has(c));
  }

  /** All construct names: unique sources then targets, as R's `construct_names.structural_model`. */
  constructNames(): string[] {
    return unique([...this.rows.map((r) => r.source), ...this.rows.map((r) => r.target)]);
  }

  /** Interaction construct names appearing in the structural model. */
  allInteractions(): string[] {
    return this.constructNames().filter(isInteraction);
  }

  /** Antecedent (source) names of a target, in path order. */
  constructAntecedents(outcome: string): string[] {
    return this.rows.filter((r) => r.target === outcome).map((r) => r.source);
  }

  /** Target names of a source, in path order. */
  constructTargets(source: string): string[] {
    return this.rows.filter((r) => r.source === source).map((r) => r.target);
  }

  hasPath(source: string, target: string): boolean {
    return this.rows.some((r) => r.source === source && r.target === target);
  }

  hasInteractions(): boolean {
    return this.constructNames().some(isInteraction);
  }

  removePathsTo(targets: readonly string[]): SmMatrix {
    return new SmMatrix(this.rows.filter((r) => !targets.includes(r.target)));
  }

  removePathsFrom(sources: readonly string[]): SmMatrix {
    return new SmMatrix(this.rows.filter((r) => !sources.includes(r.source)));
  }

  /** Append paths, returning a new instance. */
  appendPaths(rows: readonly Readonly<SMRow>[]): SmMatrix {
    return new SmMatrix([...this.rows, ...rows]);
  }

  /** Keep only paths whose source is among `sources`, as seminr's `keep_paths_from()`. */
  keepPathsFrom(sources: readonly string[]): SmMatrix {
    return new SmMatrix(this.rows.filter((r) => sources.includes(r.source)));
  }

  /** Rename sources and targets (e.g. lavaanify `*` -> `_x_`). */
  mapNames(fn: (name: string) => string): SmMatrix {
    return new SmMatrix(
      this.rows.map((r) => ({ source: fn(r.source), target: fn(r.target) })),
    );
  }
}
