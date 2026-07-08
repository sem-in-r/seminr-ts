# seminr-ts benchmarks

Wall-clock benchmarks for the heavy PLS routines, structured to sit **head-to-head
against seminr's own performance report** (`../seminr/.claude/_archive/PLAN.performance.report.html`,
PR #419). Every scenario here mirrors one in seminr's `bench/benchmark.R`, so the
TypeScript/Bun port's timings land directly beside seminr's R baseline and its
optimized `performance` branch.

## Run it

```sh
bun run benchmark/run.ts            # default params (match seminr's report)
bun run benchmark/run.ts --nboot 500
bun run benchmark/run.ts --core-only   # skip the long/large scenarios
bun run benchmark/run.ts --no-report   # console table only
```

Flags (defaults match seminr's report): `--reps 5`, `--nboot 200`, `--folds 10`,
`--largeN 2000`, `--warmup 1`, `--core-only`, `--no-report`.

## Outputs

- **Console** — median seconds per routine, plus a `seminr ÷ seminr-ts` ratio column.
- **`benchmark/report.html`** — the three-way comparison (seminr-ts vs seminr base
  vs seminr opt) with per-routine speedup ratios. *Git-ignored* (machine-specific).
- **`benchmark/results/seminr-ts-<commit>.json`** — raw medians. *Git-ignored.*

Open the report with `open benchmark/report.html`.

## Files (committed)

- `run.ts` — the harness: builds the ECSI models on `mobi`, times each routine
  (median of N reps, with JIT warmup + `Bun.gc` between reps), prints the table,
  and renders `report.html`.
- `reference-seminr.ts` — seminr's published baseline/optimized medians,
  transcribed from its performance report, keyed by scenario. **Update these if
  you re-measure seminr** (re-run `../seminr/bench/benchmark.R`).
- `equivalence.ts` — bit-identical refactor guard: 16 fixed-seed scenarios
  serialized and compared at tolerance 0 against a captured baseline
  (`--capture` writes `equivalence-baseline.json`, git-ignored). Used by the
  `performance` branch to prove optimizations change no output bit.
- `report-performance.ts` — before/after report generator: reads two
  `results/seminr-ts-<commit>.json` files and renders
  `report-performance.html` (git-ignored; `--out` overrides) with
  per-routine speedups.

## Scenarios

Mirrors seminr 1:1 — `estimatePls` (composite / PLSc / large-N), `bootstrapModel`
(sequential / parallel / interaction), `summarizePlsBoot`, `predictPls` (k-fold /
LOOCV), `estimatePlsMga`.

## Reading the numbers fairly

This is a **cross-runtime** comparison (TypeScript/Bun vs R), not a cross-branch
one. Differences reflect both algorithmic work and runtime characteristics
(JIT-compiled JS vs interpreted R over compiled BLAS). Run it on the same class
of machine seminr was measured on (Apple M1 Pro) for the ratios to be meaningful;
the report's environment table records exactly what each side ran on. Sub-10 ms
rows are timer/JIT noise. The parallel scenario uses Web Workers here vs a PSOCK
cluster in seminr. The synthetic large-N data has the same shape as seminr's but
different values (different RNG).

Correctness is **not** asserted here — that's the golden-fixture suite (`bun test`)
and `bun run check:parity`. This folder only measures speed.
