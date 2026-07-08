#!/usr/bin/env bun
/**
 * seminr-ts performance benchmark — mirrors seminr's `bench/benchmark.R` scenario
 * for scenario, so the TS port can be compared head-to-head against seminr's
 * baseline (`develop`) and optimized (`performance` branch) timings.
 *
 *   bun run benchmark/run.ts                 # default params (match seminr)
 *   bun run benchmark/run.ts --nboot 500     # heavier bootstrap
 *   bun run benchmark/run.ts --reps 10
 *   bun run benchmark/run.ts --core-only     # skip the long/large scenarios
 *   bun run benchmark/run.ts --no-report     # print table only, no HTML
 *
 * Flags (defaults chosen to match seminr's report exactly):
 *   --reps N     timing repetitions for fast ops   (default 5)
 *   --nboot N    bootstrap replications             (default 200)
 *   --folds N    k-fold CV folds                    (default 10)
 *   --largeN N   synthetic large-N row count        (default 2000)
 *   --warmup N   untimed JIT warmup runs per op     (default 1)
 *   --core-only  run only the 5 fast scenarios
 *   --no-report  skip writing benchmark/report.html
 *
 * Outputs:
 *   benchmark/results/seminr-ts-<commit>.json   raw medians (git-ignored)
 *   benchmark/report.html                     three-way comparison vs seminr
 *
 * This is a dev harness; it may use Bun APIs (Bun.gc, Bun.file, $). It measures
 * only wall-clock medians — it does NOT assert parity (the golden-fixture test
 * suite is the correctness contract; see `bun run check:parity`).
 */
import { $ } from "bun";
import { parseCsv } from "../src/data/csv.ts";
import {
  constructs,
  composite,
  reflective,
  multiItems,
  singleItem,
} from "../src/specify/constructs.ts";
import { relationships, paths } from "../src/specify/relationships.ts";
import { interactionTerm, orthogonal } from "../src/specify/interactions.ts";
import { estimatePls } from "../src/estimate/estimatePls.ts";
import { bootstrapModel } from "../src/bootstrap/bootstrap.ts";
import { bootstrapModelParallel } from "../src/bootstrap/parallel.ts";
import { predictPls } from "../src/predict/predictPls.ts";
import { estimatePlsMga } from "../src/mga/estimatePlsMga.ts";
import { summarizePlsBoot } from "../src/bootstrap/summarize.ts";
import { getColumn, type Dataset } from "../src/estimate/data.ts";
import { SEMINR_REFERENCE, SEMINR_ENV } from "./reference-seminr.ts";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Opts {
  reps: number;
  nboot: number;
  folds: number;
  largeN: number;
  warmup: number;
  coreOnly: boolean;
  report: boolean;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { reps: 5, nboot: 200, folds: 10, largeN: 2000, warmup: 1, coreOnly: false, report: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => Number(argv[++i]);
    if (a === "--reps") o.reps = next();
    else if (a === "--nboot") o.nboot = next();
    else if (a === "--folds") o.folds = next();
    else if (a === "--largeN") o.largeN = next();
    else if (a === "--warmup") o.warmup = next();
    else if (a === "--core-only") o.coreOnly = true;
    else if (a === "--no-report") o.report = false;
    else console.warn(`Unknown argument: ${a}`);
  }
  return o;
}

const opts = parseArgs(Bun.argv.slice(2));
const repoRoot = new URL("..", import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Data + models (ECSI model on mobi — identical structure to seminr's harness)
// ---------------------------------------------------------------------------

const mobi = parseCsv(await Bun.file(`${repoRoot}tests/fixtures/data/mobi.csv`).text());

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
  paths("Image", ["Expectation", "Satisfaction", "Loyalty"]),
  paths("Expectation", ["Quality", "Value", "Satisfaction"]),
  paths("Quality", ["Value", "Satisfaction"]),
  paths("Value", ["Satisfaction"]),
  paths("Satisfaction", ["Complaints", "Loyalty"]),
  paths("Complaints", "Loyalty"),
);

const mobiMmPlsc = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  reflective("Complaints", singleItem("CUSCO")),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);

const mobiMmInt = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  composite("Value", multiItems("PERV", [1, 2])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  composite("Complaints", singleItem("CUSCO")),
  composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
  interactionTerm("Image", "Expectation", orthogonal),
);
const mobiSmInt = relationships(
  paths("Image", ["Expectation", "Satisfaction", "Loyalty"]),
  paths("Expectation", ["Quality", "Value", "Satisfaction"]),
  paths("Quality", ["Value", "Satisfaction"]),
  paths("Value", ["Satisfaction"]),
  paths("Satisfaction", ["Complaints", "Loyalty"]),
  paths("Complaints", "Loyalty"),
  paths("Image*Expectation", "Satisfaction"),
);

/**
 * Synthetic large-N dataset: resample mobi rows with small deterministic
 * Gaussian noise, matching seminr's construction (resample + rnorm(sd=0.1)) so
 * the correlation structure stays realistic and no rows are exact duplicates.
 * NOTE: the RNG differs from R's, so this data is NOT byte-identical to
 * seminr's largeN set — the point is the same shape (N×24) and structure, not
 * identical values. Iteration counts can differ by a hair as a result.
 */
function makeLargeN(n: number): Dataset {
  // mulberry32 PRNG + Box-Muller — seeded, reproducible across runs.
  let s = 123 >>> 0;
  const rand = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
  const src = mobi.values;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const base = src[Math.floor(rand() * src.length)]!;
    rows.push(base.map((v) => v + 0.1 * gauss()));
  }
  return { columns: mobi.columns, values: rows };
}

// ---------------------------------------------------------------------------
// Timing harness
// ---------------------------------------------------------------------------

interface Result {
  key: string;
  label: string;
  scenario: string;
  median: number;
  min: number;
  max: number;
  reps: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

async function bench(
  key: string,
  label: string,
  scenario: string,
  fn: () => unknown | Promise<unknown>,
  reps = opts.reps,
): Promise<Result> {
  for (let i = 0; i < opts.warmup; i++) await fn(); // JIT warmup, untimed
  const times: number[] = [];
  for (let i = 0; i < reps; i++) {
    Bun.gc(true);
    const t0 = Bun.nanoseconds();
    await fn();
    times.push((Bun.nanoseconds() - t0) / 1e9);
  }
  const med = median(times);
  process.stdout.write(
    `  ${label.padEnd(44)} median = ${med.toFixed(3).padStart(8)} s  (range ${Math.min(...times).toFixed(3)}–${Math.max(...times).toFixed(3)})\n`,
  );
  return { key, label, scenario, median: med, min: Math.min(...times), max: Math.max(...times), reps };
}

// ---------------------------------------------------------------------------
// Run scenarios
// ---------------------------------------------------------------------------

console.log("=".repeat(70));
console.log("seminr-ts Performance Benchmark");
console.log("=".repeat(70));
console.log(`  Runtime:    Bun ${Bun.version} (${process.platform}/${process.arch})`);
console.log(`  CPUs:       ${navigator.hardwareConcurrency}`);
console.log(`  Reps:       ${opts.reps} (long ops: fewer)   Warmup: ${opts.warmup}`);
console.log(`  Bootstrap:  ${opts.nboot}    CV folds: ${opts.folds}    Large N: ${opts.largeN}`);
console.log("-".repeat(70) + "\n");

const results: Result[] = [];
const push = (r: Result) => (results.push(r), r);

// Pre-estimated models reused across bootstrap/predict/mga scenarios.
const mobiPls = estimatePls(mobi, mobiMm, mobiSm);
const mobiPlsInt = estimatePls(mobi, mobiMmInt, mobiSmInt);
const condition = getColumn(mobi, "CUEX1").map((v) => v < 8);

push(await bench("estimate_composite", "estimatePls [composite]", "mobi ECSI, 250 obs",
  () => estimatePls(mobi, mobiMm, mobiSm)));

push(await bench("estimate_plsc", "estimatePls [PLSc/reflective]", "mobi ECSI",
  () => estimatePls(mobi, mobiMmPlsc, mobiSm)));

push(await bench("bootstrap", `bootstrapModel [nboot=${opts.nboot}]`, `nboot ${opts.nboot}, seq, seed 42`,
  () => bootstrapModel(mobiPls, { nboot: opts.nboot, seed: 42 })));

const bootPls = bootstrapModel(mobiPls, { nboot: opts.nboot, seed: 42 });
push(await bench("boot_summary", "summarizePlsBoot(boot)", `nboot ${opts.nboot}`,
  () => summarizePlsBoot(bootPls)));

push(await bench("predict_kfold", `predictPls [${opts.folds}-fold]`, `${opts.folds}-fold CV`,
  () => predictPls(mobiPls, { noFolds: opts.folds, seed: 42 }), 3));

if (!opts.coreOnly) {
  const mobiLarge = makeLargeN(opts.largeN);
  push(await bench("estimate_largeN", `estimatePls [composite, N=${opts.largeN}]`, `synthetic ${opts.largeN} obs`,
    () => estimatePls(mobiLarge, mobiMm, mobiSm)));

  push(await bench("bootstrap_parallel", `bootstrapModel [nboot=${opts.nboot}, workers=2]`, `nboot ${opts.nboot}, 2 workers`,
    () => bootstrapModelParallel(mobiPls, { nboot: opts.nboot, seed: 42, workers: 2 }), 3));

  push(await bench("predict_loocv", "predictPls [LOOCV]", "250 folds (default)",
    () => predictPls(mobiPls, { seed: 42 }), 1));

  push(await bench("mga", `estimatePlsMga [nboot=${opts.nboot}]`, `nboot ${opts.nboot}/group`,
    () => estimatePlsMga(mobiPls, condition, { nboot: opts.nboot, seed: 42 }), 1));

  push(await bench("bootstrap_interaction", `bootstrapModel [interaction, nboot=${opts.nboot}]`, `orthogonal, nboot ${opts.nboot}`,
    () => bootstrapModel(mobiPlsInt, { nboot: opts.nboot, seed: 42 }), 3));
}

// ---------------------------------------------------------------------------
// Console comparison table
// ---------------------------------------------------------------------------

const env = {
  runtime: `Bun ${Bun.version}`,
  platform: `${process.platform}/${process.arch}`,
  cpus: navigator.hardwareConcurrency,
  commit: (await $`git -C ${repoRoot} rev-parse --short HEAD`.quiet().text()).trim(),
  timestamp: (await $`date -u +%Y-%m-%dT%H:%M:%SZ`.quiet().text()).trim(),
};

console.log("\n" + "=".repeat(70));
console.log("COMPARISON vs seminr (seconds; ratio = seminr ÷ seminr-ts)");
console.log("=".repeat(70));
console.log(`  ${"Scenario".padEnd(34)}${"seminr-ts".padStart(9)}${"sr-base".padStart(9)}${"sr-opt".padStart(9)}  vs base`);
console.log("-".repeat(70));
for (const r of results) {
  const ref = SEMINR_REFERENCE[r.key];
  const ratio = ref ? ref.baseline / r.median : NaN;
  const tag = Number.isFinite(ratio) ? `${ratio >= 1 ? "×" : "×"}${ratio.toFixed(2)} ${ratio >= 1 ? "faster" : "slower"}` : "—";
  console.log(
    `  ${r.key.padEnd(34)}${r.median.toFixed(3).padStart(9)}${(ref?.baseline ?? NaN).toFixed(3).padStart(9)}${(ref?.optimized ?? NaN).toFixed(3).padStart(9)}  ${tag}`,
  );
}

// ---------------------------------------------------------------------------
// Persist raw results
// ---------------------------------------------------------------------------

const payload = { env, opts, seminrEnv: SEMINR_ENV, results };
await $`mkdir -p ${repoRoot}benchmark/results`.quiet();
const outPath = `${repoRoot}benchmark/results/seminr-ts-${env.commit}.json`;
await Bun.write(outPath, JSON.stringify(payload, null, 2));
console.log(`\nRaw results → benchmark/results/seminr-ts-${env.commit}.json`);

// ---------------------------------------------------------------------------
// HTML report
// ---------------------------------------------------------------------------

if (opts.report) {
  const reportPath = `${repoRoot}benchmark/report.html`;
  await Bun.write(reportPath, renderReport(payload));
  console.log(`Report      → benchmark/report.html`);
}

interface Payload {
  env: typeof env;
  opts: Opts;
  seminrEnv: typeof SEMINR_ENV;
  results: Result[];
}

function renderReport(p: Payload): string {
  const rows = p.results
    .map((r) => {
      const ref = SEMINR_REFERENCE[r.key];
      const vsBase = ref ? ref.baseline / r.median : NaN;
      const vsOpt = ref ? ref.optimized / r.median : NaN;
      const cls = (x: number) => (x >= 1 ? "faster" : "slower");
      const fmt = (x: number) => (Number.isFinite(x) ? `×${x.toFixed(2)} ${x >= 1 ? "faster" : "slower"}` : "—");
      return `    <tr>
      <td><code>${escapeHtml(r.label)}</code></td>
      <td>${escapeHtml(r.scenario)}</td>
      <td class="num">${r.median.toFixed(3)}</td>
      <td class="num">${ref ? ref.baseline.toFixed(3) : "—"}</td>
      <td class="num">${ref ? ref.optimized.toFixed(3) : "—"}</td>
      <td class="num ${cls(vsBase)}">${fmt(vsBase)}</td>
      <td class="num ${cls(vsOpt)}">${fmt(vsOpt)}</td>
    </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>seminr-ts performance — vs seminr</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; max-width: 68rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #ccc; padding-bottom: .4rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #ccc; padding: .4rem .6rem; text-align: left; font-size: .9rem; }
  th { background: #f2f2f2; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .faster { color: #106b21; font-weight: 600; }
  .slower { color: #a11; font-weight: 600; }
  code { background: #f5f5f5; padding: .1rem .3rem; border-radius: 3px; font-size: .85em; }
  .meta { color: #666; font-size: .85rem; }
  ul { padding-left: 1.4rem; }
</style>
</head>
<body>
<h1>seminr-ts performance — head-to-head with seminr</h1>
<p class="meta">Generated ${escapeHtml(p.env.timestamp)} · seminr-ts @ <code>${escapeHtml(p.env.commit)}</code> on ${escapeHtml(p.env.runtime)} (${escapeHtml(p.env.platform)}, ${p.env.cpus} CPUs).</p>

<p>Each row runs the <strong>same scenario</strong> that seminr's own performance report measures (<code>../seminr/bench/benchmark.R</code>), so the TS port's wall-clock lands directly beside seminr's R timings. <strong>sr-base</strong> = seminr <code>develop</code> (pre-optimization); <strong>sr-opt</strong> = seminr <code>performance</code> branch (optimized, bit-identical). Ratios are <code>seminr ÷ seminr-ts</code> — “×2.0 faster” means seminr-ts took half the time.</p>

<h2>Environment</h2>
<table>
  <tbody>
    <tr><th>seminr-ts</th><td>${escapeHtml(p.env.runtime)} · ${escapeHtml(p.env.platform)} · ${p.env.cpus} CPUs · commit <code>${escapeHtml(p.env.commit)}</code></td></tr>
    <tr><th>seminr</th><td>${escapeHtml(p.seminrEnv.machine)} · ${escapeHtml(p.seminrEnv.os)} · ${escapeHtml(p.seminrEnv.runtime)}</td></tr>
    <tr><th>seminr baseline</th><td><code>${escapeHtml(p.seminrEnv.baselineCommit)}</code></td></tr>
    <tr><th>seminr optimized</th><td>${escapeHtml(p.seminrEnv.optimizedRef)}</td></tr>
    <tr><th>Params</th><td>reps ${p.opts.reps} (long ops fewer), warmup ${p.opts.warmup}, nboot ${p.opts.nboot}, folds ${p.opts.folds}, largeN ${p.opts.largeN}</td></tr>
  </tbody>
</table>

<h2>Results</h2>
<table>
  <thead>
    <tr>
      <th>Routine</th><th>Scenario</th>
      <th class="num">seminr-ts (s)</th>
      <th class="num">seminr base (s)</th>
      <th class="num">seminr opt (s)</th>
      <th class="num">vs base</th>
      <th class="num">vs opt</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>

<h2>Reading this fairly</h2>
<ul>
  <li><strong>Cross-runtime, not cross-branch.</strong> This compares a TypeScript/Bun implementation against an R implementation. Differences reflect both algorithmic work <em>and</em> runtime (JIT-compiled JS vs interpreted R with compiled BLAS). It is an honest “how fast is the port for a user,” not a controlled language-neutral benchmark.</li>
  <li><strong>Hardware is comparable but not pinned.</strong> seminr's numbers are from an Apple M1 Pro; run this on the same class of machine for the ratios to mean what they look like. The environment table records exactly what each side ran on.</li>
  <li><strong>Parallel scenario differs in mechanism.</strong> seminr-ts uses Web Workers (<code>workers=2</code>); seminr uses a 2-core PSOCK cluster. Both pay a spawn/serialization cost; small-N parallel can be slower than sequential on either side.</li>
  <li><strong>Sub-10&nbsp;ms rows are noisy.</strong> The single-estimation scenarios quantize near timer/JIT resolution; treat their ratios as order-of-magnitude, not precise.</li>
  <li><strong>Large-N data isn't byte-identical.</strong> The synthetic ${p.opts.largeN}-row set is regenerated in TS (seeded resample + Gaussian noise) with the same shape as seminr's, but different values — iteration counts can differ slightly.</li>
  <li><strong>Medians only.</strong> No parity assertion here; correctness is enforced separately by the golden-fixture suite (<code>bun test</code>) and <code>bun run check:parity</code>.</li>
</ul>

<p class="meta">Reproduce: <code>bun run benchmark/run.ts</code>. Raw medians in <code>benchmark/results/</code>.</p>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
