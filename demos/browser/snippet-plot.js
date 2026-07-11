// seminr-ts plotting example — edit freely and press Run.
//
// plot() turns any seminr model into Graphviz DOT text; toSvg() renders it
// with real Graphviz compiled to WebAssembly, right here in the page. The
// chart plots (reliability, slopes, …) are dependency-free SVG strings.
import {
  parseCsv,
  constructs,
  composite,
  multiItems,
  singleItem,
  relationships,
  paths,
  estimatePls,
  bootstrapModel,
  plot,
  plotHtmt,
  reliabilityTable,
  plotReliabilityTable,
  seminrThemeDark,
} from "@seminr/core";
import { heading } from "@seminr/core/demo-utils";

const out = document.getElementById("out");
const figure = document.getElementById("figure");
out.textContent = "";
figure.innerHTML = "";
const log = (text) => {
  out.textContent += `${text}\n`;
};
const show = (title, svg) => {
  const caption = document.createElement("p");
  caption.className = "figure-caption";
  caption.textContent = title;
  const holder = document.createElement("div");
  holder.innerHTML = svg;
  figure.append(caption, holder);
};

const mobi = parseCsv(await (await fetch(`${location.origin}/mobi.csv`)).text());

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

log(heading("Path diagram"));
const diagram = plot(model, { title: "ECSI (PLS)" });
log(`DOT source: ${diagram.dot.split("\n").length} lines — rendering with wasm Graphviz…`);
show("plot(model) — estimated ECSI", await diagram.toSvg());

show(
  "plot(model, { theme: seminrThemeDark() })",
  await plot(model, { theme: seminrThemeDark() }).toSvg(),
);

log(heading("Bootstrapped model + HTMT"));
const boot = bootstrapModel(model, { nboot: 100, seed: 123 });
show("plot(boot) — stars + 95% CIs on the paths", await plot(boot).toSvg());
show(
  "plotHtmt(boot, { omitThresholdEdges: false })",
  await plotHtmt(boot, { omitThresholdEdges: false }).toSvg(),
);

log(heading("Chart plots (pure SVG, no renderer needed)"));
show("plotReliabilityTable(reliabilityTable(model))", plotReliabilityTable(reliabilityTable(model)).svg);
log("Done — figures rendered below.");
