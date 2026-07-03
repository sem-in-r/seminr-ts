/** mmMatrix build, accessors, selectors, and predicates (helpers-mmMatrix.R). */

import type {
  ConstructType,
  MeasurementModel,
  ConstructSpec,
} from "../specify/constructs.ts";

export interface MMRow {
  construct: string;
  measurement: string;
  type: ConstructType;
}

export type MMMatrix = MMRow[];

function isConstructSpec(e: MeasurementModel[number]): e is ConstructSpec {
  return e.kind === "construct";
}

/** Flatten construct specs into mmMatrix rows, as seminr's `mm2matrix()` (interactions excluded). */
export function buildMmMatrix(mm: MeasurementModel): MMMatrix {
  const rows: MMRow[] = [];
  for (const entry of mm) {
    if (!isConstructSpec(entry)) continue;
    for (const item of entry.items) {
      rows.push({ construct: entry.name, measurement: item, type: entry.type });
    }
  }
  return rows;
}

export function constructItems(mmMatrix: MMMatrix, construct: string): string[] {
  return mmMatrix.filter((r) => r.construct === construct).map((r) => r.measurement);
}

export function constructMode(mmMatrix: MMMatrix, construct: string): ConstructType {
  const row = mmMatrix.find((r) => r.construct === construct);
  if (!row) throw new Error(`Unknown construct: ${construct}`);
  return row.type;
}

/** Reverse lookup: the construct that owns an item. */
export function constructOfItem(mmMatrix: MMMatrix, item: string): string | undefined {
  return mmMatrix.find((r) => r.measurement === item)?.construct;
}

export function isReflective(mmMatrix: MMMatrix, construct: string): boolean {
  return constructMode(mmMatrix, construct) === "C";
}

/** Mode A weighting family: A or HOCA. */
export function isModeA(mmMatrix: MMMatrix, construct: string): boolean {
  const mode = constructMode(mmMatrix, construct);
  return mode === "A" || mode === "HOCA";
}

/** Mode B weighting family: B or HOCB. */
export function isModeB(mmMatrix: MMMatrix, construct: string): boolean {
  const mode = constructMode(mmMatrix, construct);
  return mode === "B" || mode === "HOCB";
}

export function isUnitWeighted(mmMatrix: MMMatrix, construct: string): boolean {
  return constructMode(mmMatrix, construct) === "UNIT";
}

export function isHoc(mmMatrix: MMMatrix, construct: string): boolean {
  const mode = constructMode(mmMatrix, construct);
  return mode === "HOCA" || mode === "HOCB";
}

export function isSingleItem(mmMatrix: MMMatrix, construct: string): boolean {
  return constructItems(mmMatrix, construct).length === 1;
}

function unique(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

export function allConstructs(mmMatrix: MMMatrix): string[] {
  return unique(mmMatrix.map((r) => r.construct));
}

export function allConstructsOfMode(mmMatrix: MMMatrix, mode: ConstructType): string[] {
  return unique(mmMatrix.filter((r) => r.type === mode).map((r) => r.construct));
}

export function allHoc(mmMatrix: MMMatrix): string[] {
  return [...allConstructsOfMode(mmMatrix, "HOCA"), ...allConstructsOfMode(mmMatrix, "HOCB")];
}

export function allLoc(mmMatrix: MMMatrix): string[] {
  const hoc = new Set(allHoc(mmMatrix));
  return allConstructs(mmMatrix).filter((c) => !hoc.has(c));
}

export function allItems(mmMatrix: MMMatrix): string[] {
  return unique(mmMatrix.map((r) => r.measurement));
}

/**
 * Unique measured (lower-order) item names from a measurement model list —
 * excludes higher-order composite dimension entries and interactions, as
 * seminr's `all_LOC_items()`. Used to subset data before estimation.
 */
export function measurementModelItems(mm: MeasurementModel): string[] {
  const items: string[] = [];
  for (const entry of mm) {
    if (!isConstructSpec(entry)) continue;
    if (entry.type === "HOCA" || entry.type === "HOCB" || entry.method === "two_stage") continue;
    items.push(...entry.items);
  }
  return unique(items);
}
