/**
 * Demonstration of Consistent PLS (PLSc) estimation of the ECSI model with
 * reflective constructs, mirroring seminr's `seminr-plsc-ecsi` demo.
 * PLSc is applied automatically whenever reflective constructs are present.
 *
 * Run: bun run build && bun run demos/plsc-ecsi.ts
 */
import {
  constructs,
  reflective,
  multiItems,
  singleItem,
  relationships,
  paths,
  estimatePls,
  rhoA,
} from "seminr";
import { loadMobi } from "./lib/mobi.ts";
import { heading, formatMatrix } from "./lib/print.ts";

const mobi = await loadMobi();

// reflective (common-factor) measurement triggers the PLSc correction
const mobiMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  reflective("Complaints", singleItem("CUSCO")),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
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
console.log(heading("Consistent PLS (PLSc) estimation of the ECSI model"));
console.log(`Converged in ${model.iterations} iterations.`);

console.log(heading("rho_A reliability per construct"));
console.log(formatMatrix(rhoA(model, model.constructs)));

console.log(heading("Path coefficients (PLSc-corrected)"));
console.log(formatMatrix(model.pathCoef));

console.log(heading("R-squared (PLSc-corrected)"));
console.log(formatMatrix(model.rSquared));
