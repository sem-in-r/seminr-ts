/**
 * Plotting the ECSI model family: DOT path diagrams and SVG statistical plots,
 * mirroring seminr's plotting vignette surface (and the py port's
 * demos/plot-ecsi.py): plot() diagrams for a specified, estimated, and
 * bootstrapped PLS model (plus a theme variant and the HTMT network), a CBSEM
 * diagram, and the four chart plots. Files are written to a temporary
 * directory; the DOT source itself needs no renderer.
 *
 * Run: bun run build && bun run demos/plot-ecsi.ts
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bootstrapModel,
  composite,
  constructs,
  estimateCbsem,
  estimatePls,
  interactionTerm,
  multiItems,
  orthogonal,
  paths,
  plot,
  plotHtmt,
  plotInteraction,
  plotPredictError,
  plotReliabilityTable,
  plotScores,
  predictPls,
  reflective,
  relationships,
  reliabilityTable,
  rendererAvailable,
  savePlot,
  seminrThemeDark,
  singleItem,
  summarizePlsPredict,
} from "@seminr/core";
import { loadMobi } from "./lib/mobi.ts";
import { heading } from "./lib/print.ts";

const mobi = await loadMobi();
const out = await mkdtemp(join(tmpdir(), "seminr-plots-"));
const hasRenderer = await rendererAvailable();
const imageExt = hasRenderer ? "svg" : "dot";
if (!hasRenderer) {
  console.log("No Graphviz renderer found: writing .dot sources instead of SVGs.");
}

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

// -- specified (unestimated) preview ----------------------------------------
console.log(heading("Plotting the ECSI model"));
const spec = plot(mobiMm, { title: "ECSI measurement spec" });
await spec.save(join(out, `spec_measurement.${imageExt}`));
console.log(`Measurement-model preview saved to ${join(out, `spec_measurement.${imageExt}`)}`);

// -- estimated PLS model ------------------------------------------------------
const model = estimatePls(mobi, mobiMm, mobiSm);
const diagram = plot(model, { title: "ECSI (PLS)" });
console.log("\nDOT source (first lines):");
console.log(diagram.dot.split("\n").slice(0, 6).join("\n"));
await diagram.save(join(out, `pls_ecsi.${imageExt}`));
await savePlot(join(out, "pls_ecsi.dot")); // savePlot() reuses the last plot
console.log(`Saved estimated-model diagram to ${join(out, `pls_ecsi.${imageExt}`)}`);

await plot(model, { title: "ECSI (dark theme)", theme: seminrThemeDark() }).save(
  join(out, `pls_ecsi_dark.${imageExt}`),
);
console.log(`Saved dark-theme variant to ${join(out, `pls_ecsi_dark.${imageExt}`)}`);

// -- bootstrapped model: stars + confidence intervals on the edges -----------
const boot = bootstrapModel(model, { nboot: 100, seed: 123 });
await plot(boot, { title: "ECSI (bootstrapped)", alpha: 0.05 }).save(
  join(out, `pls_ecsi_boot.${imageExt}`),
);
console.log(`Saved bootstrapped plot to ${join(out, `pls_ecsi_boot.${imageExt}`)}`);

// -- HTMT discriminant-validity network ---------------------------------------
await plotHtmt(boot, { omitThresholdEdges: false }).save(join(out, `htmt.${imageExt}`));
console.log(`Saved HTMT plot to ${join(out, `htmt.${imageExt}`)}`);

// -- CBSEM diagram (net-new DOT design; R delegates these to semPlot) --------
const cbsem = estimateCbsem(
  mobi,
  constructs(
    reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
    reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  ),
  relationships(paths({ from: ["Image", "Expectation"], to: "Satisfaction" })),
  undefined,
  { estimator: "ML" },
);
await plot(cbsem, { title: "CBSEM (standardized)" }).save(join(out, `cbsem.${imageExt}`));
console.log(`Saved CBSEM diagram to ${join(out, `cbsem.${imageExt}`)}`);

// -- statistical plots (SVG charts) -------------------------------------------
console.log(heading("Statistical plots (SVG)"));

await plotReliabilityTable(reliabilityTable(model)).save(join(out, "reliability.svg"));
console.log(`Saved reliability chart to ${join(out, "reliability.svg")}`);

await plotScores(model, ["Image", "Satisfaction", "Loyalty"]).save(join(out, "scores.svg"));
console.log(`Saved construct-score pairs plot to ${join(out, "scores.svg")}`);

const moderated = estimatePls(
  mobi,
  constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Value", multiItems("PERV", [1, 2])),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    interactionTerm("Image", "Expectation", orthogonal),
  ),
  relationships(
    paths({ from: ["Image", "Expectation", "Value", "Image*Expectation"], to: "Satisfaction" }),
  ),
);
await plotInteraction(moderated, "Image*Expectation", "Satisfaction").save(
  join(out, "slopes.svg"),
);
console.log(`Saved interaction slope plot to ${join(out, "slopes.svg")}`);

const prediction = predictPls(model, { noFolds: 10, seed: 42 });
const predictSummary = summarizePlsPredict(prediction);
await plotPredictError(predictSummary, "CUSA1").save(join(out, "predict_error_CUSA1.svg"));
console.log(`Saved predictive-error density to ${join(out, "predict_error_CUSA1.svg")}`);

console.log(`\nAll plot outputs are in ${out}`);
