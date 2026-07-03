/**
 * Demonstration of modeling a higher-order construct (two-stage approach),
 * mirroring seminr's `seminr-pls-higher_order` demo: Satisfaction as a
 * second-order composite of the Image and Value first-order constructs.
 *
 * Run: bun run demos/pls-higher-order.ts
 */
import {
  constructs,
  composite,
  higherComposite,
  multiItems,
  singleItem,
  relationships,
  paths,
  estimatePls,
} from "../src/index.ts";
import { loadMobi } from "./lib/mobi.ts";
import { heading, formatMatrix } from "./lib/print.ts";

const mobi = await loadMobi();

const mm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  composite("Value", multiItems("PERV", [1, 2])),
  // Satisfaction is a higher-order composite over two first-order constructs
  higherComposite({ constructName: "Satisfaction", dimensions: ["Image", "Value"] }),
  composite("Complaints", singleItem("CUSCO")),
  composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
);

const sm = relationships(
  paths({ from: ["Expectation", "Quality"], to: "Satisfaction" }),
  paths({ from: "Satisfaction", to: ["Complaints", "Loyalty"] }),
);

const model = estimatePls({ data: mobi, measurementModel: mm, structuralModel: sm });
console.log(heading("Two-stage higher-order construct model (Satisfaction)"));
console.log(`Stage two converged in ${model.iterations} iterations (higher-order: ${model.hoc === true}).`);

console.log(heading("First-stage path coefficients (HOC expanded to dimensions)"));
console.log(formatMatrix(model.firstStageModel!.pathCoef));

console.log(heading("Path coefficients (stage two)"));
console.log(formatMatrix(model.pathCoef));

console.log(heading("R-squared"));
console.log(formatMatrix(model.rSquared));
