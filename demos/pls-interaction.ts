/**
 * Demonstration of modeling an interaction (moderation) between two
 * constructs, mirroring seminr's `seminr-pls-interaction` demo. The same
 * Image × Expectation interaction is estimated with all three generation
 * methods for comparison.
 *
 * Run: bun run demos/pls-interaction.ts
 */
import {
  constructs,
  composite,
  multiItems,
  regressionWeights,
  interactionTerm,
  productIndicator,
  orthogonal,
  twoStage,
  relationships,
  paths,
  estimatePls,
  nmGet,
  type InteractionMethod,
} from "../src/index.ts";
import { loadMobi } from "./lib/mobi.ts";
import { heading, formatMatrix } from "./lib/print.ts";

const mobi = await loadMobi();

const methods: Array<[string, InteractionMethod]> = [
  ["product_indicator", productIndicator],
  ["orthogonal", orthogonal],
  ["two_stage", twoStage],
];

for (const [name, method] of methods) {
  const mm = constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Value", multiItems("PERV", [1, 2]), regressionWeights),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    interactionTerm({ iv: "Image", moderator: "Expectation", method }),
  );
  const sm = relationships(
    paths({ from: ["Image", "Expectation", "Value", "Image*Expectation"], to: "Satisfaction" }),
  );

  const model = estimatePls({ data: mobi, measurementModel: mm, structuralModel: sm });
  console.log(heading(`Interaction via ${name}`));
  console.log(formatMatrix(model.pathCoef));
  const moderation = nmGet(model.pathCoef, "Image*Expectation", "Satisfaction");
  console.log(`Image*Expectation -> Satisfaction: ${moderation.toFixed(4)}`);
}
