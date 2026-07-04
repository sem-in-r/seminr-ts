import { describe, it, expect } from "bun:test";
import { expandHocToLocs, prepareHigherOrderModel } from "../../src/estimate/higherOrder.ts";
import {
  constructs,
  composite,
  higherComposite,
  multiItems,
  singleItem,
} from "../../src/specify/constructs.ts";
import { paths, relationships } from "../../src/specify/relationships.ts";
import { SmMatrix } from "../../src/model/smMatrix.ts";
import { pathWeighting } from "../../src/estimate/schemes.ts";
import { loadMobi } from "../helpers/fixtures.ts";

const mobi = await loadMobi();

describe("expandHocToLocs", () => {
  const hoc = higherComposite("S", ["A", "B"]);

  it("rewires antecedent and outcome paths of the HOC to its dimensions", () => {
    const sm = SmMatrix.fromRows(relationships(paths("E", "S"), paths("S", "C")));
    const { sm: rewired, dimensions } = expandHocToLocs(hoc, sm);
    expect(dimensions).toEqual(["A", "B"]);
    expect(rewired.toRows()).toEqual([
      { source: "E", target: "A" },
      { source: "E", target: "B" },
      { source: "A", target: "C" },
      { source: "B", target: "C" },
    ]);
  });

  it("leaves models without paths into the HOC intact on the antecedent side", () => {
    const sm = SmMatrix.fromRows(relationships(paths("S", "C")));
    const { sm: rewired } = expandHocToLocs(hoc, sm);
    expect(rewired.toRows()).toEqual([
      { source: "A", target: "C" },
      { source: "B", target: "C" },
    ]);
  });
});

describe("prepareHigherOrderModel (M5 model on mobi)", () => {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
    composite("Value", multiItems("PERV", [1, 2])),
    higherComposite("Satisfaction", ["Image", "Value"]),
    composite("Complaints", singleItem("CUSCO")),
    composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
  );
  const sm = SmMatrix.fromRows(
    relationships(
      paths(["Expectation", "Quality"], "Satisfaction"),
      paths("Satisfaction", ["Complaints", "Loyalty"]),
    ),
  );

  it("appends the dimension score columns to the data", () => {
    const result = prepareHigherOrderModel(mobi, mm, sm, pathWeighting, 300, 7);
    expect(result.data.columns).toContain("Image");
    expect(result.data.columns).toContain("Value");
    expect(result.data.values[0]!.length).toBe(result.data.columns.length);
    expect(result.firstStageModel.constructs).toContain("Image");
    // the first-stage structural model no longer contains the HOC
    expect(result.firstStageModel.constructs).not.toContain("Satisfaction");
  });
});
