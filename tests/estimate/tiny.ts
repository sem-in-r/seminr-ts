/**
 * Tiny synthetic 3-construct model shared by the Slice 4 unit tests.
 * All expected values were computed with seminr internals in R
 * (scripts kept in the plan history; digits = 16).
 */
import { constructs, composite, regressionWeights } from "../../src/specify/constructs.ts";
import { MmMatrix } from "../../src/model/mmMatrix.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { SmMatrix } from "../../src/model/smMatrix.ts";
import type { Dataset } from "../../src/estimate/data.ts";

export const tinyData: Dataset = {
  columns: ["x1", "x2", "m1", "m2", "y1", "y2"],
  values: [
    [1, 2, 1, 2, 1, 3],
    [2, 1, 3, 2, 2, 1],
    [3, 4, 2, 4, 2, 3],
    [4, 3, 5, 4, 4, 5],
    [5, 6, 4, 5, 5, 4],
    [6, 5, 6, 7, 5, 6],
  ],
};

export const tinyMm = constructs(
  composite("X", ["x1", "x2"]),
  composite("M", ["m1", "m2"], regressionWeights),
  composite("Y", ["y1", "y2"]),
);

export const tinyMmMatrix = MmMatrix.fromMeasurementModel(tinyMm);

export const tinySm = SmMatrix.fromRows(relationships(paths(["X", "M"], "Y")));
