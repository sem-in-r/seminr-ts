/**
 * Browser demo runner: loads the selected example (PLS, CBSEM, or plotting)
 * into an editable textarea, auto-runs it on page load, and re-runs it on demand.
 * Snippets are evaluated as Blob ES modules after rewriting their bare
 * "@seminr/core" / "@seminr/core/demo-utils" imports to the bundles served by serve.ts
 * — so what you see in the box is exactly the code that runs.
 */

const out = document.getElementById("out")!;
const codeBox = document.getElementById("code") as HTMLTextAreaElement;
const runButton = document.getElementById("run") as HTMLButtonElement;
const examplePicker = document.getElementById("example") as HTMLSelectElement;

const EXAMPLES: Record<string, string> = {
  pls: "/snippet-pls.js",
  cbsem: "/snippet-cbsem.js",
  plot: "/snippet-plot.js",
};

async function loadExample(name: string): Promise<void> {
  const path = EXAMPLES[name] ?? EXAMPLES["pls"]!;
  codeBox.value = await (await fetch(path)).text();
}

async function run(): Promise<void> {
  runButton.disabled = true;
  out.textContent = "running…";
  const figure = document.getElementById("figure");
  if (figure) figure.innerHTML = "";
  const code = codeBox.value
    .replaceAll('from "@seminr/core/demo-utils"', `from "${location.origin}/demo-utils.js"`)
    .replaceAll('from "@seminr/core"', `from "${location.origin}/seminr.js"`);
  const moduleUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  try {
    await import(moduleUrl);
  } catch (error) {
    out.textContent += `\nError: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    URL.revokeObjectURL(moduleUrl);
    runButton.disabled = false;
  }
}

examplePicker.addEventListener("change", () => {
  void loadExample(examplePicker.value);
});
runButton.addEventListener("click", () => {
  void run();
});

await loadExample(examplePicker.value);
await run();
