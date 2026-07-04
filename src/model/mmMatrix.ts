/** Measurement-model matrix value type and accessors (helpers-mmMatrix.R). */

import { constructSpecs, type ConstructType, type MeasurementModel } from "../specify/constructs.ts";

export interface MMRow {
  construct: string;
  measurement: string;
  type: ConstructType;
}

function unique(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Immutable value type for the measurement-model matrix. All reads go through
 * seminr-named accessor methods (helpers-mmMatrix.R); transforms return new
 * instances. `toRows`/`fromRows` are the escape hatches for serialization,
 * worker boundaries, and fixture comparisons.
 */
export class MmMatrix {
  private constructor(private readonly rows: readonly Readonly<MMRow>[]) {}

  /** Flatten construct specs into rows, as seminr's `mm2matrix()` (interactions excluded). */
  static fromMeasurementModel(mm: MeasurementModel): MmMatrix {
    const rows: MMRow[] = [];
    for (const entry of constructSpecs(mm)) {
      for (const item of entry.items) {
        rows.push({ construct: entry.name, measurement: item, type: entry.type });
      }
    }
    return new MmMatrix(rows);
  }

  static fromRows(rows: readonly Readonly<MMRow>[]): MmMatrix {
    return new MmMatrix([...rows]);
  }

  /** Normalize plain rows or an existing instance to an instance. */
  static from(x: MmMatrix | readonly Readonly<MMRow>[]): MmMatrix {
    return x instanceof MmMatrix ? x : MmMatrix.fromRows(x);
  }

  toRows(): readonly Readonly<MMRow>[] {
    return this.rows;
  }

  /** Serializes as the plain row array (fixtures, logging, structured clone). */
  toJSON(): readonly Readonly<MMRow>[] {
    return this.rows;
  }

  /** Append rows, as seminr's `append_mm_rows()`. Returns a new instance. */
  appendRows(rows: readonly Readonly<MMRow>[]): MmMatrix {
    return new MmMatrix([...this.rows, ...rows]);
  }

  /** Rows whose measurement is among `items`, as seminr's `mmMatrix_for_items()`. */
  rowsForItems(items: readonly string[]): MmMatrix {
    const wanted = new Set(items);
    return new MmMatrix(this.rows.filter((r) => wanted.has(r.measurement)));
  }

  /** Rename construct and measurement fields (e.g. lavaanify `*` -> `_x_`). */
  mapNames(fn: (name: string) => string): MmMatrix {
    return new MmMatrix(
      this.rows.map((r) => ({
        construct: fn(r.construct),
        measurement: fn(r.measurement),
        type: r.type,
      })),
    );
  }

  constructItems(construct: string): string[] {
    return this.rows.filter((r) => r.construct === construct).map((r) => r.measurement);
  }

  constructMode(construct: string): ConstructType {
    const row = this.rows.find((r) => r.construct === construct);
    if (!row) throw new Error(`Unknown construct: ${construct}`);
    return row.type;
  }

  /** Reverse lookup: the construct that owns an item. */
  constructOfItem(item: string): string | undefined {
    return this.rows.find((r) => r.measurement === item)?.construct;
  }

  isReflective(construct: string): boolean {
    return this.constructMode(construct) === "C";
  }

  /** Mode A weighting family: A or HOCA. */
  isModeA(construct: string): boolean {
    const mode = this.constructMode(construct);
    return mode === "A" || mode === "HOCA";
  }

  /** Mode B weighting family: B or HOCB. */
  isModeB(construct: string): boolean {
    const mode = this.constructMode(construct);
    return mode === "B" || mode === "HOCB";
  }

  isUnitWeighted(construct: string): boolean {
    return this.constructMode(construct) === "UNIT";
  }

  isHoc(construct: string): boolean {
    const mode = this.constructMode(construct);
    return mode === "HOCA" || mode === "HOCB";
  }

  isSingleItem(construct: string): boolean {
    return this.constructItems(construct).length === 1;
  }

  allConstructs(): string[] {
    return unique(this.rows.map((r) => r.construct));
  }

  allConstructsOfMode(mode: ConstructType): string[] {
    return unique(this.rows.filter((r) => r.type === mode).map((r) => r.construct));
  }

  allHoc(): string[] {
    return [...this.allConstructsOfMode("HOCA"), ...this.allConstructsOfMode("HOCB")];
  }

  allLoc(): string[] {
    const hoc = new Set(this.allHoc());
    return this.allConstructs().filter((c) => !hoc.has(c));
  }

  allItems(): string[] {
    return unique(this.rows.map((r) => r.measurement));
  }
}

/**
 * Unique measured (lower-order) item names from a measurement model list —
 * excludes higher-order composite dimension entries and interactions, as
 * seminr's `all_LOC_items()`. Used to subset data before estimation.
 */
export function measurementModelItems(mm: MeasurementModel): string[] {
  const items: string[] = [];
  for (const entry of constructSpecs(mm)) {
    if (entry.type === "HOCA" || entry.type === "HOCB" || entry.method === "two_stage") continue;
    items.push(...entry.items);
  }
  return unique(items);
}
