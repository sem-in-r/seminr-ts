/**
 * Demonstration of quickly specifying and comparing alternative structural
 * models over the same measurement model, mirroring seminr's
 * `seminr-alternative-models` demo.
 *
 * Run: bun run build && bun run demos/alternative-models.ts
 */
import {
  constructs,
  composite,
  multiItems,
  singleItem,
  relationships,
  paths,
  estimatePls,
  type SMMatrix,
} from "seminr";
import { loadMobi } from "./lib/mobi.ts";
import { heading, formatMatrix } from "./lib/print.ts";

const mobi = await loadMobi();

// one measurement model ...
const mm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  composite("Complaints", singleItem("CUSCO")),
  composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
);

// ... several competing structural models
const alternatives: Array<[string, SMMatrix]> = [
  [
    "Alternative 1: direct effects on Loyalty only",
    relationships(paths({ from: ["Image", "Satisfaction"], to: "Loyalty" })),
  ],
  [
    "Alternative 2: mediation through Satisfaction and Complaints",
    relationships(
      paths({ from: ["Image", "Expectation"], to: "Satisfaction" }),
      paths({ from: "Satisfaction", to: ["Complaints", "Loyalty"] }),
      paths({ from: "Complaints", to: "Loyalty" }),
    ),
  ],
];

for (const [label, sm] of alternatives) {
  const model = estimatePls({ data: mobi, measurementModel: mm, structuralModel: sm });
  console.log(heading(label));
  console.log(formatMatrix(model.pathCoef));
  console.log(heading("R-squared"));
  console.log(formatMatrix(model.rSquared));
}
