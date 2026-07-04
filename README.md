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

Numerical parity with seminr (on its bundled `mobi` / ECSI dataset) is the
acceptance bar for every feature; golden fixtures are generated from the R
implementation.

## Status

Early development — not yet published. The PLS estimation core (composite and
reflective/PLSc models, path weighting/factorial schemes, interactions,
two-stage higher-order constructs, bootstrapping) matches seminr at 1e-5 on
the mobi test suite, as does the model-evaluation suite behind
`summarizePls`/`summarize` (reliability alpha/rhoA/rhoC/AVE, HTMT,
Fornell-Larcker, cross-loadings, item and antecedent VIFs, f² effect sizes,
total indirect effects, AIC/BIC, descriptives) and PLSpredict (`predictPls`:
k-fold/LOOCV cross-validated predictions with DA/EA techniques and an LM
benchmark). The covariance-based core (`estimateCfa`, `estimateCbsem`
with `std.lv = TRUE` semantics: ML point estimates, standardized solution,
standard errors, fit measures, ten Berge construct scores, product-indicator
and two-stage interactions, second-order factors via `higherReflective`)
matches seminr/lavaan on the same fixtures; see the tolerance notes in the
test helpers. The default estimator is `"MLR"`, matching seminr: robust
(Huber-White sandwich) standard errors plus Yuan-Bentler-Mplus scaled and
robust fit indices (`chisq.scaled`, `cfi.robust`, `rmsea.robust`, …), with
`estimator: "ML"` opting into plain expected-information inference. Point
estimates are identical under both.

## Runtimes

The library source is runtime-agnostic ES modules with zero dependencies — no
`node:*` or `Bun.*` APIs anywhere in `src/`. It runs in:

- **Bun** (the development toolchain: `bun test`, `bun run`)
- **Web browsers** (a test-guarded `Bun.build --target browser` bundle check
  keeps it that way)
- any other ESM runtime (Node, Deno) — nothing runtime-specific is required

Load data however your runtime provides text, then parse it with the bundled
`parseCsv`:

```ts
import { parseCsv } from "semints";

const mobi = parseCsv(await Bun.file("mobi.csv").text());       // Bun
const mobi = parseCsv(await (await fetch("/mobi.csv")).text()); // browser
```

## Usage

```ts
import {
  constructs, composite, multiItems,
  relationships, paths,
  estimatePls, bootstrapModel, nmGet,
} from "semints";

// data is { columns: string[], values: number[][] }
const measurementModel = constructs(
  composite("Image", multiItems("IMAG", [1, 2, 3, 4, 5])),
  composite("Expectation", multiItems("CUEX", [1, 2, 3])),
  composite("Satisfaction", multiItems("CUSA", [1, 2, 3])),
);

const structuralModel = relationships(
  paths(["Image", "Expectation"], "Satisfaction"),
);

const model = estimatePls(mobi, measurementModel, structuralModel);
nmGet(model.pathCoef, "Image", "Satisfaction"); // path coefficient
nmGet(model.rSquared, "Rsq", "Satisfaction");   // R²

const boot = bootstrapModel(model, { nboot: 500, seed: 123 });
nmGet(boot.pathsDescriptives, "Image", "Satisfaction Boot SD");
```

This example runs as a test in `tests/readme-example.test.ts`.

### Named arguments

Every DSL and estimation entry point also accepts a single named-arguments
object, mirroring how seminr's R API is typically called with named arguments
(`paths(from = ..., to = ...)`). Both forms are equivalent; the named form
reads closer to the R original and lets you skip optional arguments:

```ts
paths({ from: ["Image", "Expectation"], to: "Satisfaction" });
composite({ constructName: "Image", itemNames: multiItems({ itemName: "IMAG", itemNumbers: [1, 2, 3, 4, 5] }) });
interactionTerm({ iv: "Image", moderator: "Expectation", weights: modeB }); // method stays the default
estimatePls({ data: mobi, measurementModel, structuralModel });
bootstrapModel({ model, nboot: 500, seed: 123 });
```

Named forms exist for `paths`, `composite`, `reflective`, `higherComposite`,
`multiItems`, `interactionTerm`, `quadraticTerm`, `estimatePls`,
`bootstrapModel`, `bootstrapModelParallel`, `estimateCfa`, and `estimateCbsem`
(argument shapes are exported as `PathsArgs`, `CompositeArgs`, ...,
`EstimateCbsemArgs`).

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

## Parallel bootstrapping (Web Workers)

`bootstrapModelParallel` fans replications out across Web Workers — the same
API works in Bun and in browsers — and returns results identical to the
sequential `bootstrapModel` for the same seed or indices:

```ts
import { bootstrapModelParallel } from "semints";

const boot = await bootstrapModelParallel(model, { nboot: 500, seed: 123 });
// options: workers (default: hardwareConcurrency - 1), plus everything
// bootstrapModel accepts (seed, indices, resampler, nboot)
```

By default the worker module is spawned from
`new URL("./worker.js", import.meta.url)` — a runtime URL naming the compiled
`worker.js` next to the published module (under Bun-from-source it resolves to
`worker.ts`). If your bundler emits the worker elsewhere, pass a factory:

```ts
const boot = await bootstrapModelParallel(model, {
  nboot: 500,
  seed: 123,
  createWorker: () =>
    new Worker(new URL("./my-worker-bundle.js", import.meta.url), { type: "module" }),
});
```

(The worker entry is `semints/dist/bootstrap/worker.js`; bundle it with
`--target browser` for web use.) Interaction terms must use the builtin methods
(`productIndicator`, `orthogonal`, `twoStage`) — custom method closures cannot
cross the worker boundary.

## Attribution

The algorithms, API design, and test fixtures derive from
[seminr](https://github.com/sem-in-r/seminr) by Soumya Ray, Nicholas Danks, and
contributors.

## Bootstrap reproducibility

`bootstrapModel(model, { nboot, seed })` is deterministic for a given seed
**within semints** (mulberry32 PRNG), but does not reproduce R's random number
stream. For exact numerical agreement with a seminr bootstrap, pass the exact
resample indices R used via `{ indices }` (0-based row indices, one array per
replication) — R's indices for `seed` are re-derivable as
`set.seed(seed + i); sample.int(n, replace = TRUE)` for replication `i`.
The parity test suite does exactly this.

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
bun test
bun run typecheck
bun run build
```

## Demos

Runnable examples (mirroring seminr's `demo/` scripts) live in `demos/`:

```sh
bun run demos/pls-ecsi.ts            # full ECSI model + worker-parallel bootstrap
bun run demos/plsc-ecsi.ts           # consistent PLS (PLSc) with reflective constructs
bun run demos/pls-interaction.ts     # moderation via all three interaction methods
bun run demos/pls-higher-order.ts    # two-stage higher-order construct
bun run demos/alternative-models.ts  # comparing alternative structural models
bun run demos/cbsem-cfa-ecsi.ts      # covariance-based CFA + CBSEM with an interaction
bun run demos/browser/serve.ts       # browser demo: estimation + worker bootstrap in a web page
```

All demos are exercised by `tests/demos.test.ts`.
