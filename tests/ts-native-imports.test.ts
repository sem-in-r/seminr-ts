/**
 * Source hygiene: this is a Bun/TS-native package — relative module specifiers
 * must use .ts extensions, not the NodeNext .js convention. tsc rewrites them
 * to .js in dist via `rewriteRelativeImportExtensions`. Runtime URL strings
 * (the worker URLs in the parallel modules, the browser demo bundle
 * routes) are not module specifiers and are exempt by construction: this scan
 * matches only import/export `from` clauses and dynamic import() calls.
 */
import { describe, it, expect } from "bun:test";

const RELATIVE_JS_SPECIFIER = /(?:from\s*|import\s*\(\s*|import\s+)"(\.\.?\/[^"]+\.js)"/g;

describe("TS-native import specifiers", () => {
  it("no relative .js module specifier remains in src, tests, demos, or scripts", async () => {
    const glob = new Bun.Glob("{src,tests,demos,scripts}/**/*.ts");
    const offenders: string[] = [];
    for await (const path of glob.scan(new URL("..", import.meta.url).pathname)) {
      const source = await Bun.file(new URL(`../${path}`, import.meta.url)).text();
      for (const match of source.matchAll(RELATIVE_JS_SPECIFIER)) {
        offenders.push(`${path}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
