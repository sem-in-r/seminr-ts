/**
 * Demonstration of the PLS assessment loop on the full ECSI model:
 * estimate -> summarize (evaluation/validity suite) -> bootstrap summary ->
 * PLSpredict -> PLS-MGA, printed in seminr's summary layouts.
 *
 * Run: bun run demos/pls-assessment.ts
 */
import {
  constructs,
  composite,
  multiItems,
  singleItem,
  relationships,
  paths,
  estimatePls,
  bootstrapModel,
  summarizePls,
  summarizePlsBoot,
  predictPls,
  summarizePlsPredict,
  estimatePlsMga,
  getColumn,
} from "semints";
import { loadMobi } from "./lib/mobi.ts";
import {
  heading,
  formatMatrix,
  formatPlsSummary,
  formatPlsBootSummary,
  formatPlsPredictSummary,
  formatPlsMga,
} from "./lib/print.ts";

const mobi = await loadMobi();

const mobiMm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  composite("Value", multiItems("PERV", [1, 2])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  composite("Complaints", singleItem("CUSCO")),
  composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
);

const mobiSm = relationships(
  paths({ from: "Image", to: ["Expectation", "Satisfaction", "Loyalty"] }),
  paths({ from: "Expectation", to: ["Quality", "Value", "Satisfaction"] }),
  paths({ from: "Quality", to: ["Value", "Satisfaction"] }),
  paths({ from: "Value", to: ["Satisfaction"] }),
  paths({ from: "Satisfaction", to: ["Complaints", "Loyalty"] }),
  paths({ from: "Complaints", to: ["Loyalty"] }),
);

const model = estimatePls({ data: mobi, measurementModel: mobiMm, structuralModel: mobiSm });

// -- model summary (summary.seminr_model shape) ------------------------------
const summary = summarizePls(model);
console.log(heading("PLS model summary"));
console.log(formatPlsSummary(summary));
console.log("\nValidity - HTMT:");
console.log(formatMatrix(summary.validity.htmt));
console.log("\nValidity - Fornell-Larcker criteria:");
console.log(formatMatrix(summary.validity.flCriteria));
console.log("\nEffect sizes (f-squared):");
console.log(formatMatrix(summary.fSquare));
console.log("\nInformation criteria (AIC | BIC):");
console.log(formatMatrix(summary.itCriteria));

// -- bootstrap summary --------------------------------------------------------
const boot = bootstrapModel({ model, nboot: 100, seed: 123 });
console.log(heading("Bootstrap summary"));
console.log(formatPlsBootSummary(summarizePlsBoot(boot)));

// -- PLSpredict ---------------------------------------------------------------
const prediction = predictPls(model, { noFolds: 10, seed: 42 });
console.log(heading("PLSpredict (10-fold cross-validation)"));
console.log(formatPlsPredictSummary(summarizePlsPredict(prediction)));

// -- PLS-MGA ------------------------------------------------------------------
const condition = getColumn(mobi, "CUEX1").map((v) => v < 8);
const mga = estimatePlsMga(model, condition, { nboot: 50, seed: 123 });
console.log(heading("PLS-MGA (groups: CUEX1 < 8 vs rest)"));
console.log(formatPlsMga(mga));
