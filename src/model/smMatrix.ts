/** smMatrix accessors, selectors, predicates, and mutators (helpers-smMatrix.R). */

import type { SMMatrix } from "../specify/relationships.ts";

function unique(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

/** Unique targets. */
export function allEndogenous(sm: SMMatrix): string[] {
  return unique(sm.map((r) => r.target));
}

/** Unique sources. */
export function allExogenous(sm: SMMatrix): string[] {
  return unique(sm.map((r) => r.source));
}

/** Sources that are never targets. */
export function onlyExogenous(sm: SMMatrix): string[] {
  const targets = new Set(sm.map((r) => r.target));
  return allExogenous(sm).filter((c) => !targets.has(c));
}

/** Targets that are never sources. */
export function onlyEndogenous(sm: SMMatrix): string[] {
  const sources = new Set(sm.map((r) => r.source));
  return allEndogenous(sm).filter((c) => !sources.has(c));
}

/** All construct names: unique sources then targets, as R's `construct_names.structural_model`. */
export function constructNames(sm: SMMatrix): string[] {
  return unique([...sm.map((r) => r.source), ...sm.map((r) => r.target)]);
}

/** Interaction construct names appearing in the structural model. */
export function allInteractions(sm: SMMatrix): string[] {
  return constructNames(sm).filter(isInteraction);
}

/** Antecedent (source) names of a target, in path order. */
export function constructAntecedents(sm: SMMatrix, outcome: string): string[] {
  return sm.filter((r) => r.target === outcome).map((r) => r.source);
}

/** Target names of a source, in path order. */
export function constructTargets(sm: SMMatrix, source: string): string[] {
  return sm.filter((r) => r.source === source).map((r) => r.target);
}

/** A construct name denotes an interaction when it contains `*`. */
export function isInteraction(constructName: string): boolean {
  return constructName.includes("*");
}

export function hasInteractions(sm: SMMatrix): boolean {
  return constructNames(sm).some(isInteraction);
}

export function removePathsTo(sm: SMMatrix, targets: readonly string[]): SMMatrix {
  return sm.filter((r) => !targets.includes(r.target));
}

export function removePathsFrom(sm: SMMatrix, sources: readonly string[]): SMMatrix {
  return sm.filter((r) => !sources.includes(r.source));
}
