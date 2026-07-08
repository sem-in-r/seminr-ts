// seminr CBSEM/CFA example — edit freely and press Run.
//
// This is plain JavaScript evaluated as an ES module: the "seminr" and
// "seminr/demo-utils" imports are rewritten to the bundles this page serves.
// Use absolute URLs (location.origin) for fetch — the code runs from a Blob
// module, which cannot resolve path-absolute URLs.
//
// Default estimator is "MLR" (as in seminr): robust sandwich SEs + scaled and
// robust fit columns. Point estimates are identical to estimator "ML".
import {
  parseCsv,
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
} from "seminr";
import { heading, formatMatrix } from "seminr/demo-utils";

const out = document.getElementById("out");
out.textContent = "";
const log = (text) => {
  out.textContent += `${text}\n`;
};

const mobi = parseCsv(await (await fetch(`${location.origin}/mobi.csv`)).text());
log(`Loaded mobi: ${mobi.values.length} observations x ${mobi.columns.length} indicators`);

// Measurement model: reflective constructs only (CBSEM requirement)
const mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Complaints", singleItem("CUSCO")),
);
// Freed inter-item error covariances
const am = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

log(heading("Confirmatory Factor Analysis (CFA)"));
const cfa = estimateCfa({ data: mobi, measurementModel: mm, itemAssociations: am });
const cfaSummary = summarizeCfa(cfa);
log(heading("Factor loadings"));
log(formatMatrix(cfa.factorLoadings));
log(heading("Reliability (rhoC / AVE)"));
log(formatMatrix(cfaSummary.reliability));

// Full SEM with a product-indicator interaction
const finalMm = [
  ...mm,
  interactionTerm({ iv: "Image", moderator: "Expectation", method: productIndicator }),
];
const sm = relationships(
  paths({ from: ["Image", "Expectation"], to: ["Value", "Loyalty"] }),
  paths({ from: ["Complaints", "Image*Expectation"], to: "Loyalty" }),
);

log(heading("CBSEM with Image x Expectation interaction"));
const cbsem = estimateCbsem({
  data: mobi,
  measurementModel: finalMm,
  structuralModel: sm,
  itemAssociations: am,
});
const cbsemSummary = summarizeCbsem(cbsem);

log(heading("Path coefficients (R^2 row + standardized betas)"));
log(formatMatrix(cbsemSummary.pathsCoefficients));

log(heading("Structural paths with robust (MLR) significance"));
for (const row of cbsemSummary.paths.filter((r) => r.op === "~")) {
  log(
    `${row.lhs} ~ ${row.rhs}`.padEnd(34) +
      `est.std ${row.estStd.toFixed(3)}  se ${row.se.toFixed(3)}  z ${row.z.toFixed(2)}  p ${row.pvalue.toFixed(4)}`,
  );
}

log(heading("Fit (ordinary | scaled/robust)"));
const fitPairs = {
  chisq: "chisq.scaled",
  pvalue: "pvalue.scaled",
  cfi: "cfi.robust",
  tli: "tli.robust",
  rmsea: "rmsea.robust",
};
for (const [plain, robust] of Object.entries(fitPairs)) {
  log(
    `${plain.padEnd(8)} ${cbsemSummary.fit[plain].toFixed(4)}  |  ` +
      `${robust.padEnd(14)} ${cbsemSummary.fit[robust].toFixed(4)}`,
  );
}
log(`df       ${cbsemSummary.fit["df"].toFixed(0)}  (scaling factor ${cbsemSummary.fit["chisq.scaling.factor"].toFixed(4)})`);
