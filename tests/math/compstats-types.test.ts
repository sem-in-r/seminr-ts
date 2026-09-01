import { describe, it, expect } from "bun:test";

/**
 * Source hygiene at the `@compstats/core` boundary: every delegated name must
 * carry an explicit type annotation.
 *
 * `@compstats/core` 0.5.0 ships `.d.ts` files whose relative re-exports have no
 * file extension (`export { mean } from "./core/arith"`). Node16/NodeNext module
 * resolution — which this package uses, because it publishes to npm — rejects
 * that with TS2834, and `skipLibCheck: true` in tsconfig.json swallows the
 * error instead of reporting it. The result is silent and total: every name
 * imported from `@compstats/core` arrives as `any`. A bare
 * `export const lgamma = logGamma` would then publish `lgamma: any` in
 * `dist/math/index.d.ts`, and `@seminr/core/math` would lose the types its
 * consumers rely on without a single warning.
 *
 * The fix is one explicit annotation per delegation, and this is the rule that
 * keeps them there. A type-level `IsAny<T>` assertion was tried first and is
 * *not* reliable: with `T = any` the conditional resolves to `any` rather than
 * to a branch, so the assertion passes in exactly the case it exists to catch —
 * verified against a deliberately broken annotation. A textual rule fires every
 * time, and it is the same shape as `tests/ts-native-imports.test.ts`.
 *
 * Delete this once upstream ships extensions in its declarations *and* the
 * pinned version requires them — at that point `bun run typecheck` catches a
 * leak on its own.
 */

const IMPORTS_COMPSTATS = /from\s*"@compstats\/core"/;
const BARE_REEXPORT = /export\s*(?:type\s*)?\{[^}]*\}\s*from\s*"@compstats\/core"/;
/** `export const NAME =` with no `: Type` between the name and the `=`. */
const UNANNOTATED_EXPORT_CONST = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g;

const repoRoot = new URL("../..", import.meta.url);

async function sourceFiles(): Promise<Array<{ path: string; source: string }>> {
  const glob = new Bun.Glob("src/**/*.ts");
  const out: Array<{ path: string; source: string }> = [];
  for await (const path of glob.scan(Bun.fileURLToPath(repoRoot))) {
    out.push({ path, source: await Bun.file(new URL(path, repoRoot)).text() });
  }
  return out;
}

describe("the @compstats/core boundary keeps its types", () => {
  it("re-exports nothing from @compstats/core directly", async () => {
    // A bare re-export publishes upstream's (currently `any`) type verbatim and
    // gives no place to hang an annotation.
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

  it("still has delegations to guard", async () => {
    // If this drops to zero the rule above passes vacuously, which would hide a
    // future delegation added without an annotation.
    const delegating = (await sourceFiles()).filter(({ source }) =>
      IMPORTS_COMPSTATS.test(source),
    );
    expect(delegating.map(({ path }) => path).sort()).toEqual([
      "src/math/distributions.ts",
      "src/math/stats.ts",
    ]);
  });
});
