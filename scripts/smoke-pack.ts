/**
 * Tarball install smoke test — the acceptance test for packaging.
 *
 * Builds the package, packs it with `bun pm pack`, installs the tarball into a
 * scratch consumer project, and runs a consumer script that imports from
 * "seminr" (the *installed* copy in node_modules, not the repo): estimates a
 * small PLS model, asserts a known path coefficient, then runs a parallel
 * bootstrap to prove the Web Worker resolves from the installed dist/.
 *
 * Run: bun run smoke:pack
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

function run(cmd: string[], cwd: string): void {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    throw new Error(`Command failed (exit ${proc.exitCode}): ${cmd.join(" ")} in ${cwd}`);
  }
}

const workDir = mkdtempSync(join(tmpdir(), "seminr-smoke-"));
try {
  console.log(`smoke: work dir ${workDir}`);

  console.log("smoke: building dist/ ...");
  run(["bun", "run", "build"], repoRoot);

  console.log("smoke: packing tarball ...");
  run(["bun", "pm", "pack", "--destination", workDir], repoRoot);
  const tarball = readdirSync(workDir).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error(`No tarball produced in ${workDir}`);

  console.log(`smoke: installing ${tarball} into scratch consumer ...`);
  const consumerDir = join(workDir, "consumer");
  mkdirSync(consumerDir);
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify({ name: "seminr-smoke-consumer", private: true, type: "module" }, null, 2),
  );
  run(["bun", "add", join(workDir, tarball)], consumerDir);

  copyFileSync(
    join(repoRoot, "tests", "fixtures", "data", "mobi.csv"),
    join(consumerDir, "mobi.csv"),
  );
  writeFileSync(join(consumerDir, "consume.ts"), consumerScript());

  console.log("smoke: running consumer against installed package ...");
  run(["bun", "run", "consume.ts"], consumerDir);

  console.log("smoke: PASS");
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

/** The consumer imports only from "@seminr/core" — the installed node_modules copy. */
function consumerScript(): string {
  return `
import {
  constructs,
  composite,
  multiItems,
  relationships,
  paths,
  estimatePls,
  bootstrapModelParallel,
  parseCsv,
  nmGet,
} from "@seminr/core";

const mobi = parseCsv(await Bun.file(new URL("./mobi.csv", import.meta.url)).text());

const measurementModel = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);
const structuralModel = relationships(paths(["Image", "Expectation"], "Satisfaction"));

const model = estimatePls({ data: mobi, measurementModel, structuralModel });
const imagePath = nmGet(model.pathCoef, "Image", "Satisfaction");
const expected = 0.58535248;
if (Math.abs(imagePath - expected) > 1e-6) {
  throw new Error(\`Image->Satisfaction path \${imagePath} != expected \${expected}\`);
}
console.log(\`consumer: estimatePls OK (Image->Satisfaction = \${imagePath.toFixed(6)})\`);

// Worker must resolve from node_modules/@seminr/core/dist/workers/worker.js
const boot = await bootstrapModelParallel({ model, nboot: 20, seed: 123 });
if (boot.boots !== 20) throw new Error(\`Expected 20 boots, got \${boot.boots}\`);
const bootSd = nmGet(boot.pathsDescriptives, "Image", "Satisfaction Boot SD");
if (!(bootSd > 0)) throw new Error(\`Expected positive bootstrap SD, got \${bootSd}\`);
console.log(\`consumer: bootstrapModelParallel OK (boot SD = \${bootSd.toFixed(6)})\`);
`;
}
