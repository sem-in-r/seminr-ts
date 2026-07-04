/** Model specification checks (evaluate_model.R:63-101, evaluate_warnings.R). */

import { constructSpecs, type MeasurementModel } from "../specify/constructs.ts";
import { isInteraction, type SmMatrix } from "./smMatrix.ts";
import type { MmMatrix } from "./mmMatrix.ts";

/**
 * Validate model specification before estimation, as seminr's
 * `assess_model_specification()`. Throws on the first problem found.
 */
export function assessModelSpecification(
  measurementModel: MeasurementModel,
  structuralModel: SmMatrix,
  dataColumns: readonly string[],
): void {
  const specs = constructSpecs(measurementModel);
  const mmConstructNames = new Set(specs.map((s) => s.name));
  const smConstructs = structuralModel.constructNames().filter((c) => !isInteraction(c));

  if (!smConstructs.every((c) => mmConstructNames.has(c))) {
    throw new Error(
      "Some construct names in the structural model were not found in the measurement model. " +
        "Please confirm that all construct names are correctly spelled and specified. Model cannot be estimated.",
    );
  }

  const mmItems = new Set(specs.flatMap((s) => s.items));
  if (smConstructs.some((c) => mmItems.has(c))) {
    throw new Error(
      "Some construct names are the same as indicator/item names. " +
        "Construct names must not collide with indicator names. Model cannot be estimated.",
    );
  }

  // Only measured (lower-order, non-HOC) items must exist as data columns.
  const columnSet = new Set(dataColumns);
  const hocNames = new Set(specs.filter((s) => s.method === "two_stage").map((s) => s.name));
  const measuredItems = specs
    .filter((s) => s.method !== "two_stage")
    .flatMap((s) => s.items)
    .filter((item) => !hocNames.has(item));
  if (!measuredItems.every((item) => columnSet.has(item))) {
    throw new Error(
      "There is a mismatch in the names of your indicators and data. " +
        "Please confirm the indicator names and data column names match. Model cannot be estimated.",
    );
  }

  for (const interaction of structuralModel.allInteractions()) {
    const star = interaction.indexOf("*");
    const iv = interaction.slice(0, star);
    const moderator = interaction.slice(star + 1);
    for (const outcome of structuralModel.constructTargets(interaction)) {
      const antecedents = structuralModel.constructAntecedents(outcome);
      if (!antecedents.includes(iv) || !antecedents.includes(moderator)) {
        throw new Error(
          "It appears that you have not specified both IV and MV as direct effects in the structural model. Model cannot be estimated.",
        );
      }
    }
  }
}

/** Error on single-item mode B constructs, as seminr's `warning_single_item_formative()`. */
export function validateSingleItemModeB(mmMatrix: MmMatrix): void {
  for (const construct of mmMatrix.allConstructs()) {
    if (mmMatrix.isSingleItem(construct) && mmMatrix.constructMode(construct) === "B") {
      throw new Error("You cannot define a single item construct as mode B");
    }
  }
}

/**
 * Missing-data report, as seminr's `warning_missing_data()`: returns a
 * human-readable message about complete cases (the caller decides how to surface it).
 */
export function missingDataReport(
  data: readonly (readonly (number | null)[])[],
  columnNames: readonly string[],
  mmMatrix: MmMatrix,
): string {
  const itemSet = new Set(
    mmMatrix
      .allConstructs()
      .filter((c) => mmMatrix.constructMode(c) !== "HOCA" && mmMatrix.constructMode(c) !== "HOCB")
      .flatMap((c) => mmMatrix.constructItems(c))
      .filter((item) => !item.includes("*")),
  );
  const colIdx = columnNames
    .map((name, i) => ({ name, i }))
    .filter(({ name }) => itemSet.has(name))
    .map(({ i }) => i);

  const incompleteRows: number[] = [];
  data.forEach((row, r) => {
    if (colIdx.some((c) => row[c] === null || Number.isNaN(row[c] as number))) {
      incompleteRows.push(r + 1); // 1-based, like R row indices
    }
  });

  if (incompleteRows.length === 0) return `All ${data.length} observations are valid.`;
  return (
    `Data rows ${incompleteRows.join(", ")} contain missing values and will be omitted.\n` +
    `Total number of complete cases: ${data.length - incompleteRows.length}`
  );
}
