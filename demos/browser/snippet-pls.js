// semints PLS-SEM example — edit freely and press Run.
//
// This is plain JavaScript evaluated as an ES module: the "semints" and
// "semints/demo-utils" imports are rewritten to the bundles this page serves.
// Use absolute URLs (location.origin) for fetch/Worker — the code runs from a
// Blob module, which cannot resolve path-absolute URLs.
import {
  parseCsv,
  constructs,
  composite,
  multiItems,
  singleItem,
  relationships,
  paths,
  estimatePls,
  bootstrapModelParallel,
} from "semints";
import { heading, formatMatrix } from "semints/demo-utils";

const out = document.getElementById("out");
out.textContent = "";
const log = (text) => {
  out.textContent += `${text}\n`;
};

const mobi = parseCsv(await (await fetch(`${location.origin}/mobi.csv`)).text());
log(`Loaded mobi: ${mobi.values.length} observations x ${mobi.columns.length} indicators`);

// Full ECSI model: composite constructs, bootstrap across Web Workers
const mm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  composite("Value", multiItems("PERV", [1, 2])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  composite("Complaints", singleItem("CUSCO")),
  composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const sm = relationships(
  paths({ from: "Image", to: ["Expectation", "Satisfaction", "Loyalty"] }),
  paths({ from: "Expectation", to: ["Quality", "Value", "Satisfaction"] }),
  paths({ from: "Quality", to: ["Value", "Satisfaction"] }),
  paths({ from: "Value", to: ["Satisfaction"] }),
  paths({ from: "Satisfaction", to: ["Complaints", "Loyalty"] }),
  paths({ from: "Complaints", to: ["Loyalty"] }),
);

const model = estimatePls({ data: mobi, measurementModel: mm, structuralModel: sm });
log(`Estimated the ECSI model in ${model.iterations} iterations.`);
log(heading("Path coefficients"));
log(formatMatrix(model.pathCoef));
log(heading("R-squared"));
log(formatMatrix(model.rSquared));

const nboot = 200;
const workers = Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1);
log(heading(`Bootstrapping (${nboot} replications across ${workers} Web Workers)…`));
const t0 = performance.now();
const boot = await bootstrapModelParallel({
  model,
  nboot,
  seed: 123,
  createWorker: () => new Worker(`${location.origin}/worker.js`, { type: "module" }),
});
const seconds = (performance.now() - t0) / 1000;
log(`${boot.boots} successful replications, ${boot.fails} failed — ${seconds.toFixed(2)} s (${Math.round(boot.boots / seconds)} boots/s).`);
log(heading("Bootstrapped paths"));
log(formatMatrix(boot.pathsDescriptives));
