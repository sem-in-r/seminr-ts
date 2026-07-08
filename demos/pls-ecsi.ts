/**
 * Demonstration of PLS estimation of the full ECSI model on the mobi dataset,
 * mirroring seminr's `seminr-pls-ecsi` demo, plus a worker-parallel bootstrap.
 *
 * Run: bun run build && bun run demos/pls-ecsi.ts
 */
import {
  constructs,
  composite,
  multiItems,
  singleItem,
  relationships,
  paths,
  estimatePls,
  bootstrapModelParallel,
  bootTValues,
} from "@seminr/core";
import { loadMobi } from "./lib/mobi.ts";
import { heading, formatMatrix } from "./lib/print.ts";

const mobi = await loadMobi();

// measurement model: how each ECSI construct is measured
const mobiMm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  composite("Value", multiItems("PERV", [1, 2])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  composite("Complaints", singleItem("CUSCO")),
  composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
);

// structural model: the ECSI path structure
const mobiSm = relationships(
  paths({ from: "Image", to: ["Expectation", "Satisfaction", "Loyalty"] }),
  paths({ from: "Expectation", to: ["Quality", "Value", "Satisfaction"] }),
  paths({ from: "Quality", to: ["Value", "Satisfaction"] }),
  paths({ from: "Value", to: ["Satisfaction"] }),
  paths({ from: "Satisfaction", to: ["Complaints", "Loyalty"] }),
  paths({ from: "Complaints", to: ["Loyalty"] }),
);

const model = estimatePls({ data: mobi, measurementModel: mobiMm, structuralModel: mobiSm });
console.log(`Estimated the ECSI model in ${model.iterations} iterations.`);

console.log(heading("Path coefficients"));
console.log(formatMatrix(model.pathCoef));

console.log(heading("R-squared"));
console.log(formatMatrix(model.rSquared));

console.log(heading("Outer loadings"));
console.log(formatMatrix(model.outerLoadings));

// bootstrap across Web Workers (identical results to bootstrapModel)
const boot = await bootstrapModelParallel({ model, nboot: 200, seed: 123 });
console.log(heading(`Bootstrapped paths (${boot.boots} replications)`));
console.log(formatMatrix(boot.pathsDescriptives));

console.log(heading("Bootstrap t-values"));
console.log(formatMatrix(bootTValues(boot.pathsDescriptives), 2));
