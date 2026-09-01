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
import { estimateCbsem, type CbsemModel } from "../src/cbsem/estimateCbsem.ts";
import { estimateCfa, type CfaModel } from "../src/cbsem/estimateCfa.ts";
import { summarizeCbsem, summarizeCfa } from "../src/cbsem/summarize.ts";
import { associations, itemErrors } from "../src/specify/associations.ts";
import { higherReflective } from "../src/specify/reflective.ts";
import { getColumn, type Dataset } from "../src/estimate/data.ts";
import type { NamedMatrix } from "../src/math/matrix.ts";

const repoRoot = new URL("..", import.meta.url).pathname;
const BASELINE_PATH = `${repoRoot}benchmark/equivalence-baseline.json`;
const capture = Bun.argv.includes("--capture");
/** Report per-scenario move counts and worst absolute/relative deltas instead
 *  of the first N textual diffs: `--summary`. Use when a slice is expected to
 *  move numbers and the question is how far, not whether. */
const summary = Bun.argv.includes("--summary");
/** Max reported diffs per scenario: `--limit N` (default 5). */
const diffLimit = (() => {
  const i = Bun.argv.indexOf("--limit");
  return i >= 0 ? Number(Bun.argv[i + 1]) : 5;
})();

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
// CBSEM / CFA scenarios (the estimator runs once — no bootstrap loop, so the
// whole estimation is serialized: unstandardized matrices, standardized
// solution, fit measures, the robust layer, ten Berge scores and the summary
// tables that carry the standard errors).
// ---------------------------------------------------------------------------

const cbReflectiveMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  reflective("Complaints", singleItem("CUSCO")),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const cbEcsiSm = relationships(
  paths(["Image", "Quality"], ["Value", "Satisfaction"]),
  paths(["Value", "Satisfaction"], ["Complaints", "Loyalty"]),
  paths("Complaints", "Loyalty"),
);
const cbEcsiAm = associations(itemErrors(["PERQ1", "PERQ2"], "IMAG1"));

const cfaDocMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Quality", multiItems("PERQ", [1, 2, 3, 4, 5, 6, 7])),
);
const cfaDocAm = associations(itemErrors(["PERQ1", "PERQ2"], "CUEX3"), itemErrors("IMAG1", "CUEX2"));

const cbIntxnPartialMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", singleItem("CUEX3")),
  reflective("Value", multiItems("PERV", [1, 2])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);
const cbIntxnSm = relationships(
  paths(["Image", "Expectation", "Value", "Image*Expectation"], "Satisfaction"),
);

const cbHocMm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  higherReflective("ImageSat", ["Image", "Satisfaction"]),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Loyalty", multiItems("CUSL", [1, 2, 3])),
);
const cbHocSm = relationships(paths(["ImageSat", "Satisfaction", "Expectation"], "Loyalty"));

function estimationPayload(model: CbsemModel | CfaModel): Record<string, unknown> {
  const { fit, std, fitMeasures: fm, robust, n, estimator } = model.estimation;
  return {
    n,
    estimator,
    theta: fit.theta,
    objective: fit.objective,
    iterations: fit.iterations,
    converged: fit.converged,
    unstd: {
      lambda: fit.matrices.lambda,
      beta: fit.matrices.beta ?? null,
      psi: fit.matrices.psi,
      theta: fit.matrices.theta,
    },
    std: {
      lambda: std.lambda,
      beta: std.beta ?? null,
      psi: std.psi,
      theta: std.theta,
      corLv: std.corLv,
      r2: std.r2,
      observedSd: std.observedSd,
      latentSd: std.latentSd,
    },
    fitMeasures: fm,
    robust: robust
      ? {
          se: robust.se,
          vcov: robust.vcov,
          traceH1: robust.traceH1,
          traceH0: robust.traceH0,
          traceUGamma: robust.traceUGamma,
          scalingFactor: robust.scalingFactor,
          baselineScalingFactor: robust.baselineScalingFactor,
          scalingFactorH1: robust.scalingFactorH1,
          scalingFactorH0: robust.scalingFactorH0,
        }
      : null,
    factorLoadings: nm(model.factorLoadings),
    itemWeights: nm(model.itemWeights),
    constructScores: model.constructScores,
    lavaanModel: model.lavaanModel,
  };
}

const cbsemPayload = (model: CbsemModel) => ({
  ...estimationPayload(model),
  pathCoef: nm(model.pathCoef),
  summary: summarizeCbsem(model),
});
const cfaPayload = (model: CfaModel) => ({
  ...estimationPayload(model),
  summary: summarizeCfa(model),
});

Object.assign(scenarios, {
  cbsem_ecsi_mlr: () => cbsemPayload(estimateCbsem(mobi, cbReflectiveMm, cbEcsiSm, cbEcsiAm)),
  cbsem_ecsi_ml: () =>
    cbsemPayload(estimateCbsem(mobi, cbReflectiveMm, cbEcsiSm, cbEcsiAm, { estimator: "ML" })),
  cfa_doc: () => cfaPayload(estimateCfa(mobi, cfaDocMm, cfaDocAm)),
  cbsem_intxn_pi: () =>
    cbsemPayload(
      estimateCbsem(
        mobi,
        [
          ...cbIntxnPartialMm,
          interactionTerm({ iv: "Image", moderator: "Expectation", method: productIndicator }),
        ],
        cbIntxnSm,
      ),
    ),
  cbsem_intxn_two_stage: () =>
    cbsemPayload(
      estimateCbsem(
        mobi,
        [
          ...cbIntxnPartialMm,
          interactionTerm({ iv: "Image", moderator: "Expectation", method: twoStage }),
        ],
        cbIntxnSm,
      ),
    ),
  cbsem_hoc: () => cbsemPayload(estimateCbsem(mobi, cbHocMm, cbHocSm)),
} satisfies Record<string, () => unknown>);

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

/** One numeric field that moved between baseline and current. */
interface Move {
  path: string;
  from: number;
  to: number;
  abs: number;
  rel: number;
}

/** Collect every moved number (rather than the first few differing paths). */
function collectMoves(a: unknown, b: unknown, path: string, out: Move[]): void {
  if (a === b) return;
  if (typeof a === "number" && typeof b === "number") {
    const abs = Math.abs(a - b);
    out.push({ path, from: a, to: b, abs, rel: b === 0 ? abs : abs / Math.abs(b) });
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return;
    for (let i = 0; i < a.length; i++) collectMoves(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      collectMoves(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}.${k}`,
        out,
      );
    }
  }
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
    diffPaths(baseline[name], current[name], name, diffs, diffLimit);
    if (diffs.length === 0) {
      console.log(`  ✓ ${name}`);
      continue;
    }
    failed++;
    console.log(`  ✗ ${name}`);
    if (!summary) {
      for (const d of diffs) console.log(`      ${d}`);
      continue;
    }
    const moves: Move[] = [];
    collectMoves(baseline[name], current[name], name, moves);
    if (moves.length === 0) {
      // Diverged on something that is not a number — a version string, a name,
      // a changed shape. Those are never "within tolerance", so show them.
      for (const d of diffs) console.log(`      ${d}`);
      continue;
    }
    const worstAbs = moves.reduce((w, m) => (m.abs > w.abs ? m : w), moves[0]!);
    const worstRel = moves.reduce((w, m) => (m.rel > w.rel ? m : w), moves[0]!);
    const fields = new Set(moves.map((m) => m.path.replace(/\[\d+\]/g, "[]")));
    console.log(`      ${moves.length} number(s) moved across ${fields.size} field shape(s)`);
    console.log(
      `      worst |Δ| = ${worstAbs.abs.toExponential(2)} at ${worstAbs.path} (${worstAbs.from} → ${worstAbs.to})`,
    );
    console.log(
      `      worst relΔ = ${worstRel.rel.toExponential(2)} at ${worstRel.path} (${worstRel.from} → ${worstRel.to})`,
    );
    for (const f of [...fields].sort()) console.log(`        · ${f}`);
  }
  console.log(
    failed === 0
      ? `\nAll ${Object.keys(scenarios).length} scenarios bit-identical to baseline.`
      : `\n${failed} scenario(s) diverged from baseline.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}
