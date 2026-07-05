#!/usr/bin/env bun
/**
 * Bit-identical equivalence guard for the performance branch — the TS analog
 * of seminr's `bench/equivalence.R`. Runs every heavy PLS routine over the
 * mobi/ECSI models with fixed seeds/indices, serializes all numeric outputs,
 * and compares them against a captured baseline at tolerance 0.
 *
 *   bun run benchmark/equivalence.ts --capture   # write equivalence-baseline.json
 *   bun run benchmark/equivalence.ts             # compare current code vs baseline
 *
 * The baseline is captured on the pre-optimization commit and kept (git-ignored,
 * machine-independent — pure fp arithmetic) for the life of the branch. Any
 * optimization that changes a single bit of any output fails the compare.
 *
 * This guards refactor safety; R parity remains the job of the golden-fixture
 * suite (`bun test`) and `bun run check:parity`.
 */
import { parseCsv } from "../src/data/csv.ts";
import {
  constructs,
  composite,
  reflective,
  higherComposite,
  multiItems,
  singleItem,
  modeB,
} from "../src/specify/constructs.ts";
import { relationships, paths } from "../src/specify/relationships.ts";
import {
  interactionTerm,
  orthogonal,
  productIndicator,
  twoStage,
} from "../src/specify/interactions.ts";
import { estimatePls, type PlsModel } from "../src/estimate/estimatePls.ts";
import { bootstrapModel, bootTValues, bootPercentileCIs } from "../src/bootstrap/bootstrap.ts";
import { summarizePlsBoot } from "../src/bootstrap/summarize.ts";
import { summarizePls } from "../src/evaluate/summarizePls.ts";
import { predictPls } from "../src/predict/predictPls.ts";
import { predict } from "../src/predict/predict.ts";
import { estimatePlsMga } from "../src/mga/estimatePlsMga.ts";
import { getColumn, type Dataset } from "../src/estimate/data.ts";
import type { NamedMatrix } from "../src/math/matrix.ts";

const repoRoot = new URL("..", import.meta.url).pathname;
const BASELINE_PATH = `${repoRoot}benchmark/equivalence-baseline.json`;
const capture = Bun.argv.includes("--capture");

// ---------------------------------------------------------------------------
// Models (ECSI on mobi, same structures as benchmark/run.ts)
// ---------------------------------------------------------------------------

const mobi = parseCsv(await Bun.file(`${repoRoot}tests/fixtures/data/mobi.csv`).text());

const mobiSm = relationships(
  paths("Image", ["Expectation", "Satisfaction", "Loyalty"]),
  paths("Expectation", ["Quality", "Value", "Satisfaction"]),
  paths("Quality", ["Value", "Satisfaction"]),
  paths("Value", ["Satisfaction"]),
  paths("Satisfaction", ["Complaints", "Loyalty"]),
  paths("Complaints", "Loyalty"),
);

const mobiMm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  composite("Value", multiItems("PERV", [1, 2])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  composite("Complaints", singleItem("CUSCO")),
  composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
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

const mobiMmModeB = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5]), modeB),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7]), modeB),
  composite("Value", multiItems("PERV", [1, 2])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  composite("Complaints", singleItem("CUSCO")),
  composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
);

const interactionMm = (method: typeof orthogonal) =>
  constructs(
    composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
    composite("Expectation", multiItems("CUEX", [1, 2, 3])),
    composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
    composite("Value", multiItems("PERV", [1, 2])),
    composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
    composite("Complaints", singleItem("CUSCO")),
    composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
    interactionTerm("Image", "Expectation", method),
  );
const interactionSm = relationships(
  paths("Image", ["Expectation", "Satisfaction", "Loyalty"]),
  paths("Expectation", ["Quality", "Value", "Satisfaction"]),
  paths("Quality", ["Value", "Satisfaction"]),
  paths("Value", ["Satisfaction"]),
  paths("Satisfaction", ["Complaints", "Loyalty"]),
  paths("Complaints", "Loyalty"),
  paths("Image*Expectation", "Satisfaction"),
);

const hocMm = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  composite("Value", multiItems("PERV", [1, 2])),
  higherComposite("Satisfaction", ["Image", "Value"]),
  composite("Complaints", singleItem("CUSCO")),
  composite("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const hocSm = relationships(
  paths(["Expectation", "Quality"], "Satisfaction"),
  paths("Satisfaction", ["Complaints", "Loyalty"]),
);

// ---------------------------------------------------------------------------
// Payload builders (hand-picked plain-data views, no functions/class instances)
// ---------------------------------------------------------------------------

const nm = (m: NamedMatrix) => ({ rows: m.rows, cols: m.cols, values: m.values });

function modelPayload(model: PlsModel): Record<string, unknown> {
  return {
    iterations: model.iterations,
    weightDiff: model.weightDiff,
    pathCoef: nm(model.pathCoef),
    outerLoadings: nm(model.outerLoadings),
    outerWeights: nm(model.outerWeights),
    rSquared: nm(model.rSquared),
    constructScores: nm(model.constructScores),
    firstStage: model.firstStageModel
      ? {
          pathCoef: nm(model.firstStageModel.pathCoef),
          outerWeights: nm(model.firstStageModel.outerWeights),
          iterations: model.firstStageModel.iterations,
        }
      : null,
  };
}

const scenarios: Record<string, () => unknown> = {
  estimate_composite: () => modelPayload(estimatePls(mobi, mobiMm, mobiSm)),
  estimate_plsc: () => modelPayload(estimatePls(mobi, mobiMmPlsc, mobiSm)),
  estimate_modeB: () => modelPayload(estimatePls(mobi, mobiMmModeB, mobiSm)),
  estimate_int_orthogonal: () =>
    modelPayload(estimatePls(mobi, interactionMm(orthogonal), interactionSm)),
  estimate_int_product_indicator: () =>
    modelPayload(estimatePls(mobi, interactionMm(productIndicator), interactionSm)),
  estimate_int_two_stage: () =>
    modelPayload(estimatePls(mobi, interactionMm(twoStage), interactionSm)),
  estimate_hoc: () => modelPayload(estimatePls(mobi, hocMm, hocSm)),

  summarize_pls: () => {
    // PlsSummary is plain data (NamedMatrices, records, arrays) — serialize whole
    const model = estimatePls(mobi, mobiMm, mobiSm);
    return summarizePls(model);
  },
  summarize_plsc: () => summarizePls(estimatePls(mobi, mobiMmPlsc, mobiSm)),

  bootstrap: () => {
    const model = estimatePls(mobi, mobiMm, mobiSm);
    const boot = bootstrapModel(model, { nboot: 30, seed: 42 });
    return {
      boots: boot.boots,
      fails: boot.fails,
      pathsDescriptives: nm(boot.pathsDescriptives),
      loadingsDescriptives: nm(boot.loadingsDescriptives),
      weightsDescriptives: nm(boot.weightsDescriptives),
      htmtDescriptives: nm(boot.htmtDescriptives),
      totalPathsDescriptives: nm(boot.totalPathsDescriptives),
      tValues: nm(bootTValues(boot.pathsDescriptives)),
      pathCis: (({ lower, upper }) => ({ lower: nm(lower), upper: nm(upper) }))(
        bootPercentileCIs(boot.bootPaths),
      ),
      summary: summarizePlsBoot(boot),
    };
  },
  bootstrap_interaction: () => {
    const model = estimatePls(mobi, interactionMm(orthogonal), interactionSm);
    const boot = bootstrapModel(model, { nboot: 20, seed: 42 });
    return {
      boots: boot.boots,
      fails: boot.fails,
      pathsDescriptives: nm(boot.pathsDescriptives),
      loadingsDescriptives: nm(boot.loadingsDescriptives),
      weightsDescriptives: nm(boot.weightsDescriptives),
      htmtDescriptives: nm(boot.htmtDescriptives),
      totalPathsDescriptives: nm(boot.totalPathsDescriptives),
    };
  },

  predict_kfold: () => {
    const model = estimatePls(mobi, mobiMm, mobiSm);
    const p = predictPls(model, { noFolds: 10, seed: 42 });
    return {
      compositeOutOfSample: nm(p.composites.compositeOutOfSample),
      compositeInSample: nm(p.composites.compositeInSample),
      plsOutOfSample: nm(p.items.plsOutOfSample),
      plsInSample: nm(p.items.plsInSample),
      lmOutOfSample: nm(p.items.lmOutOfSample),
      lmInSample: nm(p.items.lmInSample),
      plsOutOfSampleResiduals: nm(p.items.plsOutOfSampleResiduals),
      lmOutOfSampleResiduals: nm(p.items.lmOutOfSampleResiduals),
    };
  },
  predict_kfold_interaction: () => {
    const model = estimatePls(mobi, interactionMm(twoStage), interactionSm);
    const p = predictPls(model, { noFolds: 5, seed: 42 });
    return {
      compositeOutOfSample: nm(p.composites.compositeOutOfSample),
      plsOutOfSample: nm(p.items.plsOutOfSample),
      lmOutOfSample: nm(p.items.lmOutOfSample),
    };
  },
  predict_loocv: () => {
    const model = estimatePls(mobi, mobiMm, mobiSm);
    const p = predictPls(model, { seed: 42 });
    return {
      compositeOutOfSample: nm(p.composites.compositeOutOfSample),
      plsOutOfSample: nm(p.items.plsOutOfSample),
      lmOutOfSample: nm(p.items.lmOutOfSample),
    };
  },
  predict_direct: () => {
    const model = estimatePls(mobi, mobiMm, mobiSm);
    const testData: Dataset = { columns: mobi.columns, values: mobi.values.slice(0, 30) };
    const p = predict(model, testData);
    return {
      predictedItems: nm(p.predictedItems),
      itemResiduals: nm(p.itemResiduals),
      predictedCompositeScores: nm(p.predictedCompositeScores),
      compositeResiduals: nm(p.compositeResiduals),
      actualStar: nm(p.actualStar),
    };
  },

  mga: () => {
    const model = estimatePls(mobi, mobiMm, mobiSm);
    const condition = getColumn(mobi, "CUEX1").map((v) => v < 8);
    return estimatePlsMga(model, condition, { nboot: 30, seed: 42 });
  },
};

// ---------------------------------------------------------------------------
// Serialize / compare (exact; NaN preserved via sentinel)
// ---------------------------------------------------------------------------

const NAN = "__NaN__";
const replacer = (_k: string, v: unknown): unknown =>
  typeof v === "number" && Number.isNaN(v) ? NAN : v;

function run(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(scenarios)) {
    const t0 = Bun.nanoseconds();
    // JSON roundtrip normalizes to plain data (drops undefined, applies NaN sentinel)
    out[name] = JSON.parse(JSON.stringify(fn(), replacer));
    console.log(`  ${name.padEnd(34)} ${((Bun.nanoseconds() - t0) / 1e9).toFixed(2)}s`);
  }
  return out;
}

function diffPaths(a: unknown, b: unknown, path: string, out: string[], limit = 5): void {
  if (out.length >= limit) return;
  if (a === b) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push(`${path}: length ${a.length} vs ${b.length}`);
      return;
    }
    for (let i = 0; i < a.length && out.length < limit; i++) diffPaths(a[i], b[i], `${path}[${i}]`, out, limit);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (out.length >= limit) return;
      diffPaths(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}.${k}`,
        out,
        limit,
      );
    }
    return;
  }
  out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

console.log(capture ? "Capturing equivalence baseline…" : "Running equivalence check…");
const current = run();

if (capture) {
  await Bun.write(BASELINE_PATH, JSON.stringify(current));
  console.log(`\nBaseline written → ${BASELINE_PATH}`);
} else {
  const baselineFile = Bun.file(BASELINE_PATH);
  if (!(await baselineFile.exists())) {
    console.error(`No baseline at ${BASELINE_PATH} — run with --capture first (on the pre-change commit).`);
    process.exit(2);
  }
  const baseline = JSON.parse(await baselineFile.text()) as Record<string, unknown>;
  let failed = 0;
  console.log("");
  for (const name of Object.keys(scenarios)) {
    const diffs: string[] = [];
    diffPaths(baseline[name], current[name], name, diffs);
    if (diffs.length === 0) {
      console.log(`  ✓ ${name}`);
    } else {
      failed++;
      console.log(`  ✗ ${name}`);
      for (const d of diffs) console.log(`      ${d}`);
    }
  }
  console.log(
    failed === 0
      ? `\nAll ${Object.keys(scenarios).length} scenarios bit-identical to baseline.`
      : `\n${failed} scenario(s) diverged from baseline.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}
