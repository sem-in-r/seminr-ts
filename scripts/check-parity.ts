#!/usr/bin/env bun
/**
 * check-parity.ts — regenerate the golden fixtures from the sibling `../seminr`
 * source tree and report, tolerance-aware, whether any of seminr's numbers have
 * moved. Run this manually whenever seminr ships a new release.
 *
 *   bun run scripts/check-parity.ts
 *
 * What it does:
 *   1. Snapshots the current on-disk fixtures (in memory).
 *   2. Runs both R generators (generate-fixtures.R, generate-cbsem-fixtures.R),
 *      overwriting tests/fixtures/expected/*.json in place.
 *   3. Compares old vs new numerically at PARITY_TOLERANCE (1e-5), separating:
 *        - BEYOND tolerance  -> real divergence; investigate before committing.
 *        - within tolerance  -> harmless float wobble; safe to accept.
 *        - structural        -> keys/files/strings added, removed, or changed shape.
 *      META timestamps are ignored; the seminr commit/version delta is reported.
 *   4. Leaves the freshly generated fixtures on disk so you can `bun test` and
 *      `git diff` them. Prints how to revert.
 *
 * Requires: R with devtools + jsonlite (+ lavaan for CBSEM) on PATH, and the
 * seminr source tree checked out at ../seminr. This is a dev script; it may use
 * Bun APIs (unlike library code in src/).
 *
 * Exit code: 0 if fixtures are unchanged or changed only within tolerance;
 * 1 if anything moved beyond tolerance or changed structurally (CI-friendly).
 */
import { $ } from "bun";
import { PARITY_TOLERANCE } from "../src/estimate/constants.ts";

const TOL = PARITY_TOLERANCE;
const repoRoot = new URL("..", import.meta.url).pathname;
const expectedDir = `${repoRoot}tests/fixtures/expected`;
const mobiCsv = `${repoRoot}tests/fixtures/data/mobi.csv`;
const seminrDir = `${repoRoot}../seminr`;

const META_FILES = new Set(["META.json", "META-cbsem.json"]);
// META fields that legitimately change on every run — never a parity signal.
const META_IGNORE = new Set(["generatedAt"]);

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(2);
}

if (!(await Bun.file(`${seminrDir}/DESCRIPTION`).exists())) {
  fail(`seminr source tree not found at ../seminr (looked for ${seminrDir}/DESCRIPTION).\n` +
    `  Clone/checkout the sibling repo before regenerating fixtures.`);
}
if (!Bun.which("Rscript")) {
  fail(`Rscript not on PATH. Install R (with devtools, jsonlite, and lavaan) to regenerate fixtures.`);
}

// Warn (don't block) if the fixtures already have uncommitted edits — the
// comparison then reads "your working tree" as the baseline, which is fine but
// worth flagging so a surprising diff isn't misread.
const dirty = (await $`git -C ${repoRoot} status --porcelain tests/fixtures`.quiet().text()).trim();
if (dirty) {
  console.warn("⚠  tests/fixtures already has uncommitted changes; comparing against your working tree, not HEAD.\n");
}

// ---------------------------------------------------------------------------
// Snapshot -> regenerate -> snapshot
// ---------------------------------------------------------------------------

type Snapshot = Map<string, string>; // filename -> raw text

async function snapshot(): Promise<Snapshot> {
  const snap: Snapshot = new Map();
  const glob = new Bun.Glob("*.json");
  for await (const name of glob.scan({ cwd: expectedDir })) {
    snap.set(name, await Bun.file(`${expectedDir}/${name}`).text());
  }
  snap.set("__mobi.csv", await Bun.file(mobiCsv).text());
  return snap;
}

console.log("→ Snapshotting current fixtures…");
const before = await snapshot();

async function restore(snap: Snapshot): Promise<void> {
  for (const [name, text] of snap) {
    const path = name === "__mobi.csv" ? mobiCsv : `${expectedDir}/${name}`;
    await Bun.write(path, text);
  }
}

console.log("→ Regenerating fixtures from ../seminr (this runs R; may take a minute)…\n");
try {
  await $`Rscript scripts/generate-fixtures.R`.cwd(repoRoot);
  await $`Rscript scripts/generate-cbsem-fixtures.R`.cwd(repoRoot);
} catch (err) {
  console.error(`\n✗ A generator failed (${(err as { exitCode?: number }).exitCode ?? "error"}). Restoring previous fixtures…`);
  await restore(before);
  fail("Fixtures restored to their pre-run state. Fix the R environment and retry.");
}

console.log("\n→ Comparing…\n");
const after = await snapshot();

// ---------------------------------------------------------------------------
// Tolerance-aware recursive comparison
// ---------------------------------------------------------------------------

interface Diffs {
  beyond: { path: string; a: number; b: number; delta: number }[];
  within: number; // count of numeric cells that moved but stayed <= TOL
  structural: string[]; // human-readable descriptions
}

function newDiffs(): Diffs {
  return { beyond: [], within: 0, structural: [] };
}

function compare(a: unknown, b: unknown, path: string, out: Diffs): void {
  // number vs number: the parity signal
  if (typeof a === "number" && typeof b === "number") {
    const delta = Math.abs(a - b);
    if (delta > TOL) out.beyond.push({ path, a, b, delta });
    else if (delta > 0) out.within++;
    return;
  }
  // exact scalar equality (strings, booleans, null)
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (a !== b) out.structural.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    return;
  }
  // arrays
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      out.structural.push(`${path}: array/object shape changed`);
      return;
    }
    if (a.length !== b.length) {
      out.structural.push(`${path}: length ${a.length} → ${b.length}`);
      return;
    }
    for (let i = 0; i < a.length; i++) compare(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  // objects
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    if (!(k in ao)) out.structural.push(`${p}: added`);
    else if (!(k in bo)) out.structural.push(`${p}: removed`);
    else compare(ao[k], bo[k], p, out);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

// seminr commit/version delta from the META files
for (const meta of META_FILES) {
  const oldMeta = before.get(meta);
  const newMeta = after.get(meta);
  if (!oldMeta || !newMeta) continue;
  const o = JSON.parse(oldMeta);
  const n = JSON.parse(newMeta);
  const label = meta.replace(".json", "");
  if (o.seminrCommit !== n.seminrCommit || o.seminrVersion !== n.seminrVersion) {
    console.log(`seminr [${label}]: ${o.seminrVersion} @ ${String(o.seminrCommit).slice(0, 10)}` +
      ` → ${n.seminrVersion} @ ${String(n.seminrCommit).slice(0, 10)}`);
  } else {
    console.log(`seminr [${label}]: unchanged (${n.seminrVersion} @ ${String(n.seminrCommit).slice(0, 10)})`);
  }
}
console.log("");

const allNames = new Set([...before.keys(), ...after.keys()]);
let totalBeyond = 0;
let totalStructural = 0;
let totalWithin = 0;
const changedFiles: string[] = [];

for (const name of [...allNames].sort()) {
  if (name === "__mobi.csv") {
    if (before.get(name) !== after.get(name)) {
      console.log("● data/mobi.csv: CONTENTS CHANGED (byte-for-byte)");
      totalStructural++;
      changedFiles.push("data/mobi.csv");
    }
    continue;
  }
  const oldText = before.get(name);
  const newText = after.get(name);
  if (oldText === undefined) { console.log(`● ${name}: NEW fixture file`); totalStructural++; changedFiles.push(name); continue; }
  if (newText === undefined) { console.log(`● ${name}: REMOVED fixture file`); totalStructural++; changedFiles.push(name); continue; }

  const oldJson = JSON.parse(oldText);
  const newJson = JSON.parse(newText);
  // Ignore volatile META timestamp fields.
  if (META_FILES.has(name)) {
    for (const f of META_IGNORE) { delete oldJson[f]; delete newJson[f]; }
  }
  const d = newDiffs();
  compare(oldJson, newJson, "", d);

  if (d.beyond.length === 0 && d.structural.length === 0 && d.within === 0) continue;

  changedFiles.push(name);
  totalBeyond += d.beyond.length;
  totalStructural += d.structural.length;
  totalWithin += d.within;

  const tags: string[] = [];
  if (d.beyond.length) tags.push(`${d.beyond.length} beyond tol`);
  if (d.structural.length) tags.push(`${d.structural.length} structural`);
  if (d.within) tags.push(`${d.within} within tol`);
  const marker = d.beyond.length || d.structural.length ? "●" : "○";
  console.log(`${marker} ${name}: ${tags.join(", ")}`);

  for (const s of d.structural.slice(0, 10)) console.log(`    struct  ${s}`);
  if (d.structural.length > 10) console.log(`    …and ${d.structural.length - 10} more structural`);

  const worst = d.beyond.sort((x, y) => y.delta - x.delta).slice(0, 8);
  for (const c of worst) {
    console.log(`    Δ=${c.delta.toExponential(2)}  ${c.path}: ${c.a} → ${c.b}`);
  }
  if (d.beyond.length > 8) console.log(`    …and ${d.beyond.length - 8} more beyond-tolerance cells`);
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(64)}`);
const significant = totalBeyond > 0 || totalStructural > 0;

if (!significant && totalWithin === 0) {
  console.log("✓ Fixtures unchanged. seminr's numbers match the committed contract.");
  console.log("  Nothing to do (a META timestamp/commit bump may still show in `git diff`).");
} else if (!significant) {
  console.log(`○ Only sub-tolerance float wobble (${totalWithin} cells, all ≤ ${TOL}). Safe to accept.`);
  console.log("  Run `bun test` to confirm green, then commit the regenerated fixtures.");
} else {
  console.log(`● Parity moved: ${totalBeyond} cell(s) beyond ${TOL}, ${totalStructural} structural change(s).`);
  console.log("  This is the case worth investigating BEFORE committing:");
  console.log("    • run `bun test` — if it fails, seminr-ts no longer matches seminr (real divergence).");
  console.log("    • if tests pass, our code already tracks the new numbers; review the diff and commit.");
  console.log(`  Files: ${changedFiles.join(", ")}`);
}

console.log("\nTo revert the regenerated fixtures:");
console.log("  git checkout -- tests/fixtures/");
console.log("");

process.exit(significant ? 1 : 0);
