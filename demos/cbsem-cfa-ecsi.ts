/**
 * Demonstration of specifying and estimating covariance-based models,
 * mirroring seminr's `seminr-cbsem-cfa-ecsi` demo:
 * - CFA to confirm the measurement model (with freed item-error covariances)
 * - full CBSEM with a product-indicator interaction
 *
 * Run: bun run demos/cbsem-cfa-ecsi.ts
 */
import {
  constructs,
  reflective,
  multiItems,
  singleItem,
  interactionTerm,
  productIndicator,
  relationships,
  paths,
  associations,
  itemErrors,
  estimateCfa,
  estimateCbsem,
  summarizeCfa,
  summarizeCbsem,
} from "../src/index.ts";
import { loadMobi } from "./lib/mobi.ts";
import { heading, formatMatrix } from "./lib/print.ts";

const mobi = await loadMobi();

// Measurement model: reflective constructs only (CBSEM requirement)
const mobiMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Complaints", singleItem("CUSCO")),
);

// Freed inter-item error covariances
const mobiAm = associations(
  itemErrors(["PERQ1", "PERQ2"], "CUEX3"),
  itemErrors("IMAG1", "CUEX2"),
);

// CONFIRMATORY FACTOR ANALYSIS
console.log(heading("Confirmatory Factor Analysis (CFA)"));
const mobiCfa = estimateCfa({ data: mobi, measurementModel: mobiMm, itemAssociations: mobiAm });
const cfaSummary = summarizeCfa(mobiCfa);
console.log(heading("Factor loadings"));
console.log(formatMatrix(mobiCfa.factorLoadings));
console.log(heading("Reliability (rhoC / AVE)"));
console.log(formatMatrix(cfaSummary.reliability));
console.log(heading("Fit"));
for (const key of ["chisq", "df", "pvalue", "cfi", "tli", "rmsea", "srmr"]) {
  console.log(`${key.padEnd(8)} ${cfaSummary.fit[key]!.toFixed(4)}`);
}

// STRUCTURAL EQUATION MODEL with a product-indicator interaction
const finalMm = [
  ...mobiMm,
  interactionTerm({ iv: "Image", moderator: "Expectation", method: productIndicator }),
];
const mobiSm = relationships(
  paths({ from: ["Image", "Expectation"], to: ["Value", "Loyalty"] }),
  paths({ from: ["Complaints", "Image*Expectation"], to: "Loyalty" }),
);

console.log(heading("CBSEM with Image x Expectation interaction"));
const mobiCbsem = estimateCbsem({
  data: mobi,
  measurementModel: finalMm,
  structuralModel: mobiSm,
  itemAssociations: mobiAm,
});
const cbsemSummary = summarizeCbsem(mobiCbsem);

console.log(heading("Path coefficients (R^2 row + standardized betas)"));
console.log(formatMatrix(cbsemSummary.pathsCoefficients));

console.log(heading("Structural paths with significance"));
for (const row of cbsemSummary.paths.filter((r) => r.op === "~")) {
  console.log(
    `${row.lhs} ~ ${row.rhs}`.padEnd(34) +
      `est.std ${row.estStd.toFixed(3)}  se ${row.se.toFixed(3)}  z ${row.z!.toFixed(2)}  p ${row.pvalue!.toFixed(4)}`,
  );
}

console.log(heading("Reliability (rhoC / AVE)"));
console.log(formatMatrix(cbsemSummary.reliability));

console.log(heading("Construct correlations"));
console.log(formatMatrix(cbsemSummary.constructCorrelations));

console.log(heading("Antecedent VIFs"));
for (const [outcome, vifs] of Object.entries(cbsemSummary.antecedentVifs)) {
  const cells = Object.entries(vifs)
    .map(([name, vif]) => `${name}=${Number.isNaN(vif) ? "NA" : vif.toFixed(3)}`)
    .join("  ");
  console.log(`${outcome}: ${cells}`);
}

console.log(heading("Fit"));
for (const key of ["chisq", "df", "pvalue", "cfi", "tli", "rmsea", "srmr", "aic", "bic"]) {
  console.log(`${key.padEnd(8)} ${cbsemSummary.fit[key]!.toFixed(4)}`);
}

// note: interaction path uses the original name in pathCoef
console.log(heading("Interaction effect (pathCoef row Image*Expectation)"));
console.log(
  `Image*Expectation -> Loyalty: ${mobiCbsem.pathCoef.values[
    mobiCbsem.pathCoef.rows.indexOf("Image*Expectation")
  ]![mobiCbsem.pathCoef.cols.indexOf("Loyalty")]!.toFixed(4)}`,
);
