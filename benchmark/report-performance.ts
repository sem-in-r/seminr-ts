#!/usr/bin/env bun
/**
 * Before/after report for the `performance` branch — the seminr-ts analog of
 * seminr's archived performance report (PR #419). Reads two raw-results files
 * produced by `benchmark/run.ts` (they are keyed by commit) and renders a
 * self-contained HTML comparison with per-routine speedups, alongside seminr's
 * published reference timings for context.
 *
 *   bun run benchmark/run.ts                      # produce results for HEAD
 *   bun run benchmark/report-performance.ts --baseline 604d329 --after <commit>
 *
 * Defaults: --baseline 604d329 (the branch-cut commit), --after = current HEAD.
 * Output: benchmark/report-performance.html (git-ignored, machine-specific);
 * override with --out. The `performance` branch's final report was archived
 * once to .claude/plans/PLAN.performance-report.html beside its plan.
 */
import { $ } from "bun";
import { SEMINR_REFERENCE, SEMINR_ENV } from "./reference-seminr.ts";

const repoRoot = new URL("..", import.meta.url).pathname;

interface Result {
  key: string;
  label: string;
  scenario: string;
  median: number;
  min: number;
  max: number;
  reps: number;
}
interface Payload {
  env: { runtime: string; platform: string; cpus: number; commit: string; timestamp: string };
  opts: { reps: number; nboot: number; folds: number; largeN: number; warmup: number };
  results: Result[];
}

function argValue(flag: string): string | undefined {
  const i = Bun.argv.indexOf(flag);
  return i === -1 ? undefined : Bun.argv[i + 1];
}

const baselineCommit = argValue("--baseline") ?? "604d329";
const afterCommit =
  argValue("--after") ?? (await $`git -C ${repoRoot} rev-parse --short HEAD`.quiet().text()).trim();

async function load(commit: string): Promise<Payload> {
  const path = `${repoRoot}benchmark/results/seminr-ts-${commit}.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.error(`No results for ${commit} — run \`bun run benchmark/run.ts\` at that commit first (${path}).`);
    process.exit(2);
  }
  return JSON.parse(await file.text()) as Payload;
}

const base = await load(baselineCommit);
const after = await load(afterCommit);

/** One-line summaries of the branch's optimization commits, newest last. */
const OPTIMIZATIONS: readonly { area: string; what: string }[] = [
  {
    area: "stats primitives",
    what: "cross-column cov/cor center each column and take its SD once instead of ~5 passes per pair; symmetric blocks computed once and mirrored (hits the PLS loop, PLSc, HTMT, cross-loadings, VIFs)",
  },
  {
    area: "simplePLS loop",
    what: "iteration-invariant work hoisted: builtin outer modes close over normData's fixed item columns/means/SDs (mode-B item correlations computed once), score standardization runs in place, inner regressions build X′X from cached score columns, convergence diff reuses one buffer, pre-interaction loadings pass skipped without interactions",
  },
  {
    area: "bootstrap replications",
    what: "meanReplacement returns complete data unchanged instead of deep-copying every row; resampled datasets share row references",
  },
  {
    area: "HTMT",
    what: "each construct's item block selected and centered once per call instead of per construct pair (runs once per bootstrap replication)",
  },
  {
    area: "PLSpredict LM benchmark",
    what: "the shared design matrix is factored (X′, X′X) once per endogenous construct; each item solves against its own X′y",
  },
];

const fmtS = (x: number) => (x < 0.0995 ? x.toFixed(3) : x.toFixed(2));
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const rows = base.results
  .map((b) => {
    const a = after.results.find((r) => r.key === b.key);
    if (!a) return "";
    const speedup = b.median / a.median;
    const ref = SEMINR_REFERENCE[b.key];
    return `    <tr>
      <td><code>${esc(b.label)}</code></td>
      <td class="num">${fmtS(b.median)}</td>
      <td class="num">${fmtS(a.median)}</td>
      <td class="num ${speedup >= 1 ? "faster" : "slower"}">×${speedup.toFixed(2)}</td>
      <td class="num muted">${ref ? fmtS(ref.baseline) : "—"}</td>
      <td class="num muted">${ref ? fmtS(ref.optimized) : "—"}</td>
    </tr>`;
  })
  .join("\n");

const optItems = OPTIMIZATIONS.map(
  (o) => `  <li><strong>${esc(o.area)}</strong> — ${esc(o.what)}</li>`,
).join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>seminr-ts performance branch — before/after</title>
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
  .muted { color: #888; }
  code { background: #f5f5f5; padding: .1rem .3rem; border-radius: 3px; font-size: .85em; }
  .meta { color: #666; font-size: .85rem; }
  ul { padding-left: 1.4rem; }
  li { margin: .3rem 0; }
</style>
</head>
<body>
<h1>seminr-ts performance branch — before/after</h1>
<p class="meta">Generated ${esc(after.env.timestamp)} · baseline <code>${esc(baselineCommit)}</code> vs optimized <code>${esc(afterCommit)}</code> · ${esc(after.env.runtime)} (${esc(after.env.platform)}, ${after.env.cpus} CPUs).</p>

<p>Same discipline as seminr's performance branch (PR #419): every change is a pure
reordering/reuse of the existing arithmetic, verified <strong>bit-identical</strong>
(tolerance 0) against a pre-change baseline across 16 fixed-seed scenarios
(<code>benchmark/equivalence.ts</code>), with the golden-fixture suite and
<code>check:parity</code> green throughout. The two rightmost columns show seminr's own
published R timings for the same scenarios, for context (different runtime — see notes).</p>

<h2>Results (median seconds)</h2>
<table>
  <thead>
    <tr>
      <th>Routine</th>
      <th class="num">before</th>
      <th class="num">after</th>
      <th class="num">speedup</th>
      <th class="num muted">seminr base</th>
      <th class="num muted">seminr opt</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<p class="meta">Params: reps ${after.opts.reps} (long ops fewer), warmup ${after.opts.warmup}, nboot ${after.opts.nboot}, folds ${after.opts.folds}, largeN ${after.opts.largeN}. Sub-10 ms rows quantize near timer/JIT resolution; treat their ratios as approximate.</p>

<h2>What changed</h2>
<ul>
${optItems}
</ul>
<p>Rejected (recorded in the branch plan): reusing RMS-scaled scores across loop
iterations and Welford-style variance (both change fp summation order — not
bit-identical); pre-building model matrices per bootstrap replication (measured
≤2% after the loop work, not worth widening the public estimation surface);
flat typed-array matrix storage (deferred to FUTURE.md — invasive rewrite,
revisit only if matmul dominates a future profile).</p>

<h2>Environment</h2>
<table>
  <tbody>
    <tr><th>seminr-ts</th><td>${esc(after.env.runtime)} · ${esc(after.env.platform)} · ${after.env.cpus} CPUs</td></tr>
    <tr><th>baseline commit</th><td><code>${esc(baselineCommit)}</code> (branch cut from main)</td></tr>
    <tr><th>optimized commit</th><td><code>${esc(afterCommit)}</code></td></tr>
    <tr><th>seminr reference</th><td>${esc(SEMINR_ENV.machine)} · ${esc(SEMINR_ENV.runtime)} · base ${esc(SEMINR_ENV.baselineCommit)}, opt ${esc(SEMINR_ENV.optimizedRef)}</td></tr>
  </tbody>
</table>

<h2>Verification</h2>
<ul>
  <li><strong>Equivalence:</strong> <code>bun run benchmark/equivalence.ts</code> — 16 scenarios (estimation variants incl. PLSc, mode B, all three interaction methods, HOC; summaries; bootstrap descriptives/t-values/CIs; PLSpredict k-fold/LOOCV/direct; PLS-MGA) compared at tolerance 0 against the baseline captured on <code>${esc(baselineCommit)}</code>.</li>
  <li><strong>R parity:</strong> golden-fixture suite (<code>bun test</code>) and <code>bun run check:parity</code> (fixtures regenerated from ../seminr and diffed) unchanged.</li>
</ul>

<p class="meta">Reproduce: <code>bun run benchmark/run.ts</code> on each commit, then
<code>bun run benchmark/report-performance.ts --baseline ${esc(baselineCommit)} --after ${esc(afterCommit)}</code>.
Raw medians in <code>benchmark/results/</code>.</p>
</body>
</html>
`;

const outPath = argValue("--out") ?? `${repoRoot}benchmark/report-performance.html`;
await Bun.write(outPath, html);
console.log(`Report → ${outPath} (baseline ${baselineCommit}, after ${afterCommit})`);
