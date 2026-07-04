import { describe, it, expect } from "bun:test";
import {
  lavaanifyName,
  unlavaanifyName,
  lavaanMmSyntax,
  lavaanSmSyntax,
  lavaanItemAssociations,
  lavaanModelSyntax,
} from "../../src/cbsem/lavaanSyntax.ts";
import {
  composite,
  constructs,
  multiItems,
  reflective,
  singleItem,
} from "../../src/specify/constructs.ts";
import { higherReflective } from "../../src/specify/reflective.ts";
import { associations, itemErrors } from "../../src/specify/associations.ts";
import { relationships, paths } from "../../src/specify/relationships.ts";
import { SmMatrix } from "../../src/model/smMatrix.ts";
import { MmMatrix } from "../../src/model/mmMatrix.ts";
import { loadFixture } from "../helpers/fixtures.ts";

interface SyntaxFixture {
  lavaanModel: string;
}

const c1Mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Complaints", singleItem("CUSCO")),
);
const c1Am = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

const c3Mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  reflective("Complaints", singleItem("CUSCO")),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const c3Am = associations(itemErrors(["PERQ1", "PERQ2"], "IMAG1"));
const c3Sm = SmMatrix.fromRows(relationships(
  paths({ from: ["Image", "Quality"], to: ["Value", "Satisfaction"] }),
  paths({ from: ["Value", "Satisfaction"], to: ["Complaints", "Loyalty"] }),
  paths({ from: "Complaints", to: "Loyalty" }),
));

const c1Fixture = await loadFixture<SyntaxFixture>("cbsem-C1_cfa_demo");
const c3Fixture = await loadFixture<SyntaxFixture>("cbsem-C3_ecsi");
const c4FsFixture = await loadFixture<SyntaxFixture>("cbsem-C4_first_stage_cfa");
const c5Fixture = await loadFixture<SyntaxFixture>("cbsem-C5_hoc");

describe("lavaanifyName", () => {
  it("maps * to _x_ and back", () => {
    expect(lavaanifyName("Image*Expectation")).toBe("Image_x_Expectation");
    expect(unlavaanifyName("Image_x_Expectation")).toBe("Image*Expectation");
    expect(lavaanifyName("Image")).toBe("Image");
  });
});

describe("lavaanMmSyntax", () => {
  it("errors on non-reflective constructs", () => {
    const mm = MmMatrix.fromMeasurementModel(constructs(composite("Image", ["IMAG1", "IMAG2"])));
    expect(() => lavaanMmSyntax(mm)).toThrow(
      "Image must be a reflective construct for a CBSEM model",
    );
  });
});

describe("lavaanModelSyntax parity with seminr", () => {
  it("reproduces the C1 CFA lavaan model byte-for-byte", () => {
    const syntax = lavaanModelSyntax({
      mmMatrix: MmMatrix.fromMeasurementModel(c1Mm),
      itemAssociations: c1Am,
    });
    expect(syntax).toBe(c1Fixture.lavaanModel);
  });

  it("reproduces the C3 CBSEM lavaan model byte-for-byte", () => {
    const syntax = lavaanModelSyntax({
      mmMatrix: MmMatrix.fromMeasurementModel(c3Mm),
      structuralModel: c3Sm,
      itemAssociations: c3Am,
    });
    expect(syntax).toBe(c3Fixture.lavaanModel);
  });

  it("reproduces the C5 HOC lavaan model (higher_reflective flattens like reflective)", () => {
    const c5Mm = constructs(
      reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
      higherReflective("ImageSat", ["Image", "Satisfaction"]),
      reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
      reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
    );
    const c5Sm = SmMatrix.fromRows(relationships(
      paths({ from: ["ImageSat", "Satisfaction", "Expectation"], to: "Loyalty" }),
    ));
    const syntax = lavaanModelSyntax({
      mmMatrix: MmMatrix.fromMeasurementModel(c5Mm),
      structuralModel: c5Sm,
    });
    expect(syntax).toBe(c5Fixture.lavaanModel);
    expect(syntax).toContain("ImageSat =~ Image + Satisfaction");
  });

  it("reproduces the association-free C4 first-stage CFA incl. trailing separator", () => {
    const mm = constructs(
      reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
      reflective("Expectation", singleItem("CUEX3")),
      reflective("Value", multiItems("PERV", [1, 2])),
      reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    );
    const syntax = lavaanModelSyntax({ mmMatrix: MmMatrix.fromMeasurementModel(mm) });
    expect(syntax).toBe(c4FsFixture.lavaanModel);
    expect(syntax.endsWith("\n\n")).toBe(true);
    expect(syntax).toContain("CUEX3 ~~ 0*CUEX3");
  });
});

describe("block generators", () => {
  it("associations block renders itemA ~~ itemB lines under its header", () => {
    expect(lavaanItemAssociations(c1Am)).toBe(
      "# Residual Covariances\nCUEX3 ~~ PERQ1\nCUEX3 ~~ PERQ2\nCUEX2 ~~ IMAG1",
    );
  });

  it("associations block is null for empty/absent associations", () => {
    expect(lavaanItemAssociations(undefined)).toBeNull();
    expect(lavaanItemAssociations([])).toBeNull();
  });

  it("regressions render one line per endogenous construct in target order", () => {
    expect(lavaanSmSyntax(c3Sm)).toBe(
      "# Regressions\nValue ~ Image + Quality\nSatisfaction ~ Image + Quality\nComplaints ~ Value + Satisfaction\nLoyalty ~ Value + Satisfaction + Complaints",
    );
  });
});
