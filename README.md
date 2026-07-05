# semints

SEM (Structural Equation Modeling) estimation in TypeScript: PLS-SEM and
covariance-based SEM (CBSEM/CFA).

`semints` is a port of the modeling and estimation core of the
[seminr](https://github.com/sem-in-r/seminr) R package: model specification DSL,
the simplePLS estimation algorithm, PLSc consistency correction, bootstrapping,
interaction terms, higher-order constructs, and covariance-based estimation
(CFA and full CBSEM). Where seminr delegates covariance-based estimation to
[lavaan](https://lavaan.ugent.be), semints implements the maximum-likelihood
estimator itself (LISREL matrices, analytic gradient, BFGS) and matches
lavaan's output.

It serves two kinds of users:

- **Data analysts** who want to run a complete SEM analysis — specify, estimate,
  assess, bootstrap, predict — in a modern scripting runtime (Bun, Node, or a
  notebook that runs TypeScript) instead of R. Start at
  [Analyzing data with semints](#analyzing-data-with-semints).
- **Developers** embedding SEM estimation in a product — a dashboard, a survey
  platform, a browser tool. The library is zero-dependency, runtime-agnostic
  ESM with TypeScript types. Start at
  [Integrating semints into a product](#integrating-semints-into-a-product).

## Status

Early development — not yet published to npm. Numerical parity with seminr on
its bundled `mobi` / ECSI dataset is the acceptance bar for every feature;
golden fixtures are generated from the R implementation.

- **PLS-SEM**: estimation (composite and reflective/PLSc models, path
  weighting/factorial schemes, interactions, two-stage higher-order
  constructs, bootstrapping) matches seminr at 1e-5, as do the
  model-evaluation suite behind `summarizePls` (reliability, HTMT,
  Fornell-Larcker, cross-loadings, VIFs, f², total indirect effects, AIC/BIC,
  descriptives), PLSpredict (`predictPls`), and PLS-MGA (`estimatePlsMga`).
- **CBSEM/CFA**: `estimateCfa` and `estimateCbsem` (with `std.lv = TRUE`
  semantics: ML point estimates, standardized solution, standard errors, fit
  measures, ten Berge construct scores, product-indicator and two-stage
  interactions, second-order factors via `higherReflective`) match
  seminr/lavaan on the same fixtures. The default estimator is `"MLR"`,
  matching seminr: robust (Huber-White sandwich) standard errors plus
  Yuan-Bentler-Mplus scaled and robust fit indices, with `estimator: "ML"`
  opting into plain expected-information inference.
- Missing data is handled by `meanReplacement` (default) or `naOmit`, matching
  seminr's `missing` argument.

## Analyzing data with semints

### Install

```sh
bun add semints    # or: npm install semints
```

(Until the first npm release, install from a checkout: `bun add /path/to/semints`.)

### A complete PLS analysis

Load your data as CSV text from wherever your runtime provides it, then
specify, estimate, summarize, and bootstrap:

```ts
import {
  parseCsv,
  constructs, composite, multiItems,
  relationships, paths,
  estimatePls, summarizePls,
  bootstrapModel, summarizePlsBoot,
} from "semints";

// 1. Load data — any way of obtaining CSV text works
const data = parseCsv(await Bun.file("mobi.csv").text());       // Bun
// const data = parseCsv(await (await fetch("/mobi.csv")).text()); // browser

// 2. Measurement model: how each construct is measured
const measurementModel = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);

// 3. Structural model: which constructs predict which
const structuralModel = relationships(
  paths({ from: ["Image", "Expectation"], to: "Satisfaction" }),
);

// 4. Estimate and assess
const model = estimatePls({ data, measurementModel, structuralModel });
const summary = summarizePls(model);
summary.paths;         // R², adjusted R², and path coefficients per outcome
summary.reliability;   // alpha, rhoA, rhoC, AVE per construct
summary.validity.htmt; // discriminant validity (HTMT)
summary.fSquare;       // f² effect sizes

// 5. Bootstrap confidence intervals
const boot = bootstrapModel({ model, nboot: 1000, seed: 42 });
const bootSummary = summarizePlsBoot(boot);
bootSummary.bootstrappedPaths; // orig. est., boot mean/SD, t-stat, 95% CI per path
```

This example runs as a test in `tests/readme-example.test.ts`.

**Reading the output.** Result tables are `NamedMatrix` values — plain
`{ rows, cols, values }` objects with named rows and columns. Read a single
cell with `nmGet(matrix, row, col)`, e.g.
`nmGet(summary.paths, "Image", "Satisfaction")`, or render the whole table any
way you like (the demos include a text formatter that prints seminr's summary
layouts). Interpretation matches seminr: `summary.paths` stacks R²/AdjR² on
top of path coefficients per endogenous column, and
`bootstrappedPaths` columns are `Original Est. / Bootstrap Mean / Bootstrap SD
/ T Stat. / 2.5% CI / 97.5% CI / Bootstrap P Val` per structural path.

Beyond estimation and bootstrapping, the same assessment workflow seminr
offers is available: `predictPls` (k-fold cross-validated PLSpredict with an
LM benchmark), `estimatePlsMga` (multi-group analysis), and mediation helpers
(`specificEffectSignificance`, `totalIndirectCi`).

### Coming from seminr (R)

The API deliberately mirrors seminr; the correspondence is mechanical:

| seminr (R) | semints (TypeScript) |
| --- | --- |
| `mobi <- read.csv("mobi.csv")` | `const mobi = parseCsv(csvText)` |
| `multi_items("IMAG", 1:5)` | `multiItems("IMAG", [1, 2, 3, 4, 5])` |
| `composite("Image", ...)` | `composite("Image", ...)` |
| `paths(from = "Image", to = "Loyalty")` | `paths({ from: "Image", to: "Loyalty" })` |
| `estimate_pls(mobi, mm, sm)` | `estimatePls({ data: mobi, measurementModel, structuralModel })` |
| `summary(model)` | `summarize(model)` (or `summarizePls`) |
| `bootstrap_model(model, nboot = 1000)` | `bootstrapModel({ model, nboot: 1000 })` |
| `predict_pls(model, ...)` | `predictPls({ model, ... })` |
| `estimate_pls_mga(model, condition)` | `estimatePlsMga({ model, condition })` |
| `estimate_cbsem(mobi, mm, sm)` | `estimateCbsem({ data: mobi, measurementModel, structuralModel })` |

General rules: R's `snake_case` becomes `camelCase`, R vectors become arrays,
and R's named arguments become a single named-arguments object. Every DSL and
estimation entry point accepts that named form (`paths`, `composite`,
`reflective`, `higherComposite`, `multiItems`, `interactionTerm`,
`quadraticTerm`, `estimatePls`, `bootstrapModel`, `bootstrapModelParallel`,
`estimateCfa`, `estimateCbsem`; argument shapes are exported as `PathsArgs`,
`CompositeArgs`, ..., `EstimateCbsemArgs`). Positional forms mirroring the R
signatures work too — both are equivalent:

```ts
paths({ from: ["Image", "Expectation"], to: "Satisfaction" });
paths(["Image", "Expectation"], "Satisfaction"); // same result
```

One deliberate difference: seminr's `summary()` printout becomes structured
data here (see "Reading the output" above), and bootstrap seeds are
deterministic within semints but do not reproduce R's random stream — see
[Bootstrap reproducibility](#bootstrap-reproducibility).

### Covariance-based SEM (CBSEM / CFA)

The same model specification estimates as a covariance-based model — seminr
syntax first resolves to the same measurement/structural matrices the PLS
routines use, then a maximum-likelihood estimator (equivalent to
`lavaan::sem(..., std.lv = TRUE)`) processes them:

```ts
import {
  constructs, reflective, multiItems, singleItem,
  relationships, paths, associations, itemErrors,
  estimateCfa, estimateCbsem, summarizeCbsem, nmGet,
} from "semints";

const mm = constructs(
  reflective("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  reflective("Expectation", multiItems("CUEX", [1, 2, 3])),
  reflective("Satisfaction", multiItems("CUSA", [1, 2, 3])),
  reflective("Complaints", singleItem("CUSCO")),
);

// free selected inter-item error covariances
const am = associations(itemErrors("IMAG1", "CUEX2"));

// CFA of the measurement model
const cfa = estimateCfa({ data: mobi, measurementModel: mm, itemAssociations: am });
cfa.factorLoadings;              // standardized loadings
cfa.constructScores;             // ten Berge factor scores
cfa.lavaanModel;                 // the equivalent lavaan syntax string

// full structural model
const sm = relationships(
  paths({ from: ["Image", "Expectation"], to: "Satisfaction" }),
  paths({ from: "Satisfaction", to: "Complaints" }),
);
const cbsem = estimateCbsem({ data: mobi, measurementModel: mm, structuralModel: sm, itemAssociations: am });
nmGet(cbsem.pathCoef, "Image", "Satisfaction"); // standardized path coefficient

const summary = summarizeCbsem(cbsem);
summary.fit["cfi"];              // chisq, df, pvalue, cfi, tli, rmsea (+CI), srmr, aic, bic, ...
summary.reliability;             // rhoC / AVE per construct
summary.paths;                   // est.std, se, z, p, CIs per parameter
```

This example runs as a test in `tests/readme-example.test.ts`. CBSEM
interactions support the `productIndicator` and `twoStage` methods, and
second-order factors are specified with `higherReflective(name, dimensions)`.

## Integrating semints into a product

### Data contract

Estimation consumes a `Dataset`: a plain
`{ columns: string[], values: number[][] }` object (row-major; `NaN` marks
missing values, handled by the `missing` strategy). Produce it however you
like — `parseCsv(text)` is a bundled convenience, not a requirement — and
subset it with the exported `getColumn` / `selectColumns` helpers. Results
come back as plain data too: `NamedMatrix` (`{ rows, cols, values }`, read
cells with `nmGet`) and typed summary records — everything is
JSON-serializable; nothing is a class instance.

### Runtime support

The library is zero-dependency, runtime-agnostic ES modules — no `node:*` or
`Bun.*` APIs anywhere in `src/` (a test-guarded browser-target bundle check
keeps it that way). It runs in Bun, Node, Deno, and web browsers.
TypeScript declarations ship in the package, `sideEffects: false` is set, so
bundlers can tree-shake unused estimators (e.g. shipping only PLS without the
CBSEM code).

### Web Workers and bundlers

`bootstrapModelParallel`, `predictPlsParallel`, and `estimatePlsMgaParallel`
fan work out across Web Workers — the same API works in Bun and in browsers —
and return results identical to their sequential counterparts for the same
seed or indices:

```ts
import { bootstrapModelParallel } from "semints";

const boot = await bootstrapModelParallel(model, { nboot: 500, seed: 123 });
// options: workers (default: hardwareConcurrency - 1), plus everything
// bootstrapModel accepts (seed, indices, resampler, nboot)
```

By default the worker module is spawned from
`new URL("../workers/worker.js", import.meta.url)` — a runtime URL naming the
compiled shared worker next to the published modules. Runtimes that resolve
`node_modules` URLs (Bun, Node) need no configuration. If your bundler emits
the worker elsewhere, pass a factory:

```ts
const boot = await bootstrapModelParallel(model, {
  nboot: 500,
  seed: 123,
  createWorker: () =>
    new Worker(new URL("./my-worker-bundle.js", import.meta.url), { type: "module" }),
});
```

(The shared worker entry is `semints/dist/workers/worker.js`; bundle it with
`--target browser` for web use — the browser demo's `serve.ts` shows a working
setup.) Two serialization limits apply across the worker boundary: interaction
terms must use the builtin methods (`productIndicator`, `orthogonal`,
`twoStage`), and models estimated with a custom missing-data function must use
the sequential variants (the builtin `meanReplacement` and `naOmit` both
work).

### Error behavior

Model-specification and data problems throw plain `Error`s with descriptive
messages (unknown columns, unreachable constructs, non-converging estimation);
there are no error codes or custom error classes yet. Numerical edge cases in
summaries follow seminr and R conventions: undefined cells (e.g. HTMT above
the diagonal) are `NaN` rather than omitted.

### Versioning

Pre-1.0: minor versions (`0.x` → `0.y`) may change the API; patch versions
are additive or fixes only. Pin a minor range (`~0.1`) if you need stability.

### License obligations

semints is licensed **GPL-3.0** (it is a derivative port of the GPL-3 seminr).
GPL-3 is a copyleft license: distributing a product that bundles or links
semints — including serving a bundled browser app — carries GPL-3 obligations
for that product's code. Check GPL-3 compatibility with your licensing before
shipping it in a closed-source product; using it server-side or internally,
or for your own analyses, imposes nothing.

## Demos

Runnable examples (mirroring seminr's `demo/` scripts) live in `demos/`. They
consume the built package — they import `"semints"` exactly as an installed
consumer would — so build first:

```sh
bun run build
bun run demos/pls-ecsi.ts            # full ECSI model + worker-parallel bootstrap
bun run demos/plsc-ecsi.ts           # consistent PLS (PLSc) with reflective constructs
bun run demos/pls-interaction.ts     # moderation via all three interaction methods
bun run demos/pls-higher-order.ts    # two-stage higher-order construct
bun run demos/alternative-models.ts  # comparing alternative structural models
bun run demos/pls-assessment.ts      # evaluation suite, boot summary, PLSpredict, PLS-MGA
bun run demos/cbsem-cfa-ecsi.ts      # covariance-based CFA + CBSEM with an interaction
bun run demos/browser/serve.ts       # browser demo: estimation + worker bootstrap in a web page
```

All demos are exercised by `tests/demos.test.ts`.

## Bootstrap reproducibility

`bootstrapModel(model, { nboot, seed })` is deterministic for a given seed
**within semints** (mulberry32 PRNG), but does not reproduce R's random number
stream. For exact numerical agreement with a seminr bootstrap, pass the exact
resample indices R used via `{ indices }` (0-based row indices, one array per
replication) — R's indices for `seed` are re-derivable as
`set.seed(seed + i); sample.int(n, replace = TRUE)` for replication `i`.
The parity test suite does exactly this.

## Attribution and license

The algorithms, API design, and test fixtures derive from
[seminr](https://github.com/sem-in-r/seminr) by Soumya Ray, Nicholas Danks, and
contributors. semints is licensed under the
[GNU General Public License v3.0](LICENSE), matching seminr.

## Development

Development uses [Bun](https://bun.sh) exclusively (tests, scripts, package
management); the TypeScript compiler provides typechecking and the published
`dist/` output.

The source is TS-native: relative imports use `.ts` extensions (Bun runs them
directly), and tsc's `rewriteRelativeImportExtensions` rewrites them to `.js`
only in the emitted `dist/`. A hygiene test
(`tests/ts-native-imports.test.ts`) keeps `.js` module specifiers out of the
source; the only `.js` strings in the repo are runtime references to compiled
output (the dist worker URL and the browser demo's bundle routes).

```sh
bun install
bun test               # includes building dist/ for the demo tests
bun run typecheck        # library
bun run typecheck:demos  # demos (builds dist/ first)
bun run build
bun run smoke:pack       # tarball install smoke test
```
