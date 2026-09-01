import { describe, it, expect } from "bun:test";

/**
 * The `@compstats/core` type boundary, checked from both sides.
 *
 * The history matters for reading what follows. `@compstats/core` 0.5.0 shipped
 * `.d.ts` files whose relative re-exports had no file extension
 * (`export { mean } from "./core/arith"`). Node16/NodeNext module resolution —
 * which this package uses, because it publishes to npm — rejects that with
 * TS2834, and `skipLibCheck: true` in tsconfig.json swallows the error instead
 * of reporting it. The result was silent and total: every name imported from
 * `@compstats/core` arrived as `any`, so `export const lgamma = logGamma` would
 * have published `lgamma: any` in our own `dist/math/index.d.ts` and stripped
 * the types off `@seminr/core/math` for its consumers.
 *
 * 0.6.0 fixed it upstream. Verified here at the bump: under the pinned version
 * `pchisq("hello", {}, [], 1, 2, 3)` is a compile error (TS2554, "Expected 2-4
 * arguments, but got 6") where under 0.5.0 it compiled clean.
 *
 * So there are two properties to hold, and this file checks each where it lives:
 *
 * 1. **Upstream still resolves.** The first test reads the installed
 *    declarations and fails if any relative specifier has lost its extension.
 *    That is the actual precondition, and a version bump is where it would
 *    break. `bun run typecheck` cannot see it — `skipLibCheck` is on, and
 *    turning it off would check every dependency's declarations, which is not a
 *    practical setting for this repo.
 * 2. **Our side stays annotated anyway.** The remaining tests keep the
 *    explicit-annotation rule at the delegation sites. It is no longer
 *    load-bearing, and it stays because it costs nothing and is what would keep
 *    our published types exact if upstream ever regressed.
 *
 * A type-level `IsAny<T>` assertion was tried first and is *not* reliable: with
 * `T = any` the conditional resolves to `any` rather than to a branch, so the
 * assertion passes in exactly the case it exists to catch. A textual rule fires
 * every time, and it is the same shape as `tests/ts-native-imports.test.ts`.
 */

const IMPORTS_COMPSTATS = /from\s*"@compstats\/core(?:\/[\w-]+)?"/;
const BARE_REEXPORT = /export\s*(?:type\s*)?\{[^}]*\}\s*from\s*"@compstats\/core(?:\/[\w-]+)?"/;
/** `export const NAME =` with no `: Type` between the name and the `=`. */
const UNANNOTATED_EXPORT_CONST = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g;

const repoRoot = new URL("../..", import.meta.url);

async function sourceFiles(): Promise<Array<{ path: string; source: string }>> {
  const glob = new Bun.Glob("src/**/*.ts");
  const out: Array<{ path: string; source: string }> = [];
  for await (const entry of glob.scan(Bun.fileURLToPath(repoRoot))) {
    // `Bun.Glob.scan` yields the platform's own separator, so on Windows this
    // arrives as `src\\math\\stats.ts`. Normalized here because the assertions
    // below compare path strings literally, and a URL takes forward slashes on
    // every platform anyway.
    const path = entry.replaceAll("\\", "/");
    out.push({ path, source: await Bun.file(new URL(path, repoRoot)).text() });
  }
  return out;
}

describe("the @compstats/core boundary keeps its types", () => {
  it("resolves under NodeNext: every relative specifier upstream carries its extension", async () => {
    const dist = Bun.fileURLToPath(new URL("node_modules/@compstats/core/dist/", repoRoot));
    const glob = new Bun.Glob("**/*.d.ts");
    // A relative `from "./x"` or `import("./x")` with no extension is TS2834.
    const relative = /(?:from|import)\s*\(?\s*"(\.[^"]*)"/g;
    const offenders: string[] = [];
    let scanned = 0;
    for await (const entry of glob.scan(dist)) {
      const source = await Bun.file(dist + entry).text();
      const path = entry.replaceAll("\\", "/");
      for (const match of source.matchAll(relative)) {
        scanned++;
        const specifier = match[1]!;
        if (!specifier.endsWith(".js")) offenders.push(`${path}: ${specifier}`);
      }
    }
    // Guard the guard: a scan that found nothing would pass vacuously.
    expect(scanned).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it("re-exports nothing from @compstats/core directly", async () => {
    // A bare re-export publishes upstream's type verbatim and gives no place to
    // hang an annotation.
    const offenders = (await sourceFiles())
      .filter(({ source }) => BARE_REEXPORT.test(source))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("annotates every export const in a file that imports @compstats/core", async () => {
    const offenders: string[] = [];
    for (const { path, source } of await sourceFiles()) {
      if (!IMPORTS_COMPSTATS.test(source)) continue;
      for (const match of source.matchAll(UNANNOTATED_EXPORT_CONST)) {
        offenders.push(`${path}: export const ${match[1]} — needs an explicit type`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still has delegations to guard, and reaches them through the DOM-free entry", async () => {
    // If this drops to zero the rule above passes vacuously, which would hide a
    // future delegation added without an annotation. The subpath is asserted
    // too: `src/` must stay runtime-agnostic, and the root entry carries the
    // canvas and interactive layers.
    const delegating = (await sourceFiles()).filter(({ source }) => IMPORTS_COMPSTATS.test(source));
    expect(delegating.map(({ path }) => path).sort()).toEqual([
      "src/math/distributions.ts",
      "src/math/optimize.ts",
      "src/math/stats.ts",
    ]);
    const rootEntry = delegating.filter(({ source }) => /from\s*"@compstats\/core"/.test(source));
    expect(rootEntry.map(({ path }) => path)).toEqual([]);
  });
});
