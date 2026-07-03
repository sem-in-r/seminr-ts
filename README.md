# semints

PLS-SEM (Partial Least Squares Structural Equation Modeling) estimation in TypeScript.

`semints` is a port of the modeling and estimation core of the
[seminr](https://github.com/sem-in-r/seminr) R package: model specification DSL,
the simplePLS estimation algorithm, PLSc consistency correction, bootstrapping,
interaction terms, and higher-order constructs.

Numerical parity with seminr (on its bundled `mobi` / ECSI dataset) is the
acceptance bar for every feature; golden fixtures are generated from the R
implementation.

## Status

Early development — not yet published. The estimation core (composite and
reflective/PLSc models, path weighting/factorial schemes, interactions,
two-stage higher-order constructs, bootstrapping) matches seminr at 1e-5 on
the mobi test suite.

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
`bootstrapModel`, and `bootstrapModelParallel` (argument shapes are exported
as `PathsArgs`, `CompositeArgs`, ..., `BootstrapModelParallelArgs`).

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
bun run demos/browser/serve.ts       # browser demo: estimation + worker bootstrap in a web page
```

All demos are exercised by `tests/demos.test.ts`.
