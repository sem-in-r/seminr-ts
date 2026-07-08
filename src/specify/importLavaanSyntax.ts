/**
 * Lavaan-syntax import, as seminr's experimental `csem2seminr` /
 * `lavaan2seminr` (import_lavaan_syntax.R:28-92): `<~` statements become
 * mode B composites (the cSEM convention), `=~` statements reflective
 * constructs, and `~` statements structural paths, bundled via
 * `specifyModel`. seminr delegates parsing to `lavaan::lavaanify`; this is a
 * minimal parser for those three operators. Like seminr, parameter
 * constraints/labels and item associations are not supported, and `~~`
 * (covariance) statements are silently dropped.
 */

import { composite, reflective, modeB, type MeasurementModel } from "./constructs.ts";
import type { SMRow } from "./relationships.ts";
import { specifyModel, type SpecifiedModel } from "./specifyModel.ts";

interface Statement {
  lhs: string;
  op: "=~" | "<~" | "~~" | "~";
  rhs: string[];
}

/** Ordered so composite ops match before the bare `~` they contain. */
const OPERATORS = ["=~", "<~", "~~", "~"] as const;

function toStatements(lavSyntax: string): Statement[] {
  const lines = lavSyntax
    .split(/[\n;]/)
    .map((line) => line.replace(/#.*$/, "").trim());

  // merge continuations: a statement continues past a trailing operator/plus
  // or onto a line that starts with "+"
  const merged: string[] = [];
  for (const line of lines) {
    if (line === "") continue;
    const previous = merged[merged.length - 1];
    if (previous !== undefined && (/[+~]$/.test(previous) || line.startsWith("+"))) {
      merged[merged.length - 1] = `${previous} ${line}`;
    } else {
      merged.push(line);
    }
  }

  return merged.map((statement) => {
    const op = OPERATORS.find((candidate) => statement.includes(candidate));
    if (!op) throw new Error(`No lavaan operator (=~, <~, ~) in statement: ${statement}`);
    const at = statement.indexOf(op);
    const lhs = statement.slice(0, at).trim();
    const rhs = statement
      .slice(at + op.length)
      .split("+")
      .map((term) => term.trim())
      .filter((term) => term !== "");
    for (const name of [lhs, ...rhs]) {
      if (name === "" || /[\s*]/.test(name)) {
        throw new Error(
          `Unsupported lavaan syntax near "${name}": parameter constraints/labels are not supported`,
        );
      }
    }
    return { lhs, op, rhs };
  });
}

/** Collect rhs terms per unique lhs, preserving first-appearance order. */
function groupByConstruct(statements: readonly Statement[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const { lhs, rhs } of statements) {
    const items = groups.get(lhs) ?? [];
    items.push(...rhs);
    groups.set(lhs, items);
  }
  return groups;
}

/**
 * Convert lavaan syntax for composite models (as used by the cSEM package)
 * into a seminr-ts model specification, as seminr's `csem2seminr()`.
 */
export function csem2seminr(lavSyntax: string): SpecifiedModel {
  const statements = toStatements(lavSyntax);

  const composites = groupByConstruct(statements.filter((s) => s.op === "<~"));
  const reflectives = groupByConstruct(statements.filter((s) => s.op === "=~"));

  const measurementModel: MeasurementModel = [
    ...[...composites].map(([name, items]) => composite(name, items, modeB)),
    ...[...reflectives].map(([name, items]) => reflective(name, items)),
  ];

  const structuralModel: SMRow[] = statements
    .filter((s) => s.op === "~")
    .flatMap(({ lhs, rhs }) => rhs.map((source) => ({ source, target: lhs })));

  return specifyModel(measurementModel, structuralModel);
}

/**
 * Alias of {@link csem2seminr}, as seminr's `lavaan2seminr`.
 * WARNING (as in seminr): does not parse all lavaan syntax.
 */
export const lavaan2seminr = csem2seminr;
