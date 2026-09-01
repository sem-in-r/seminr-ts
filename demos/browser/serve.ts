/**
 * Dev server for the browser demo. Bundles the runner (app.ts), the shared
 * worker, the library (served as /seminr.js), and the print helpers (served
 * as /demo-utils.js) for the browser target on startup, then serves them with
 * the page, the editable example sources (snippet-*.js), and the mobi dataset.
 *
 * Run: bun run build && bun run demos/browser/serve.ts   (then open the printed URL)
 */
import { mobiCsvUrl } from "../lib/mobi.ts";

/** served name -> bundle artifact name */
const BUNDLE_ALIASES: Record<string, string> = {
  "app.js": "app.js",
  "worker.js": "worker.js",
  "seminr.js": "seminr-entry.js",
  "demo-utils.js": "print.js",
};

async function buildAssets(): Promise<Map<string, string>> {
  const entrypoints = [
    Bun.fileURLToPath(new URL("./app.ts", import.meta.url)),
    Bun.fileURLToPath(new URL("../../src/workers/worker.ts", import.meta.url)),
    // The barrel, as an absolute entrypoint. Its own artifact is unused — the
    // served bundle is seminr-entry.js — but naming it here puts it in this
    // build's module graph, which is what makes `seminr-entry.ts`'s relative
    // `../../src/index.ts` resolve. Under `bun test` that relative specifier
    // fails on its own: the bundle builds fine from `bun run`, and inside the
    // test runner it raises `Could not resolve` unless something else has
    // already put that module in the graph. tests/browser-compat.test.ts
    // happens to do so when the whole suite runs, which is why this passed
    // locally for months and failed the moment CI's file order put
    // tests/demos.test.ts first. One entrypoint is cheaper than depending on
    // which test ran before this one.
    Bun.fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
    Bun.fileURLToPath(new URL("./seminr-entry.ts", import.meta.url)),
    Bun.fileURLToPath(new URL("../lib/print.ts", import.meta.url)),
  ];
  const result = await Bun.build({ entrypoints, target: "browser" });
  if (!result.success) {
    // Report enough to diagnose from a CI log on a machine you cannot reach.
    // `AggregateError`'s sub-errors are not printed by every runner, and a bare
    // "Could not resolve" without the importer, the resolution kind or the
    // runtime version is not actionable — which is exactly the position a
    // Bun 1.4.0 Linux-only failure on this build left us in.
    const detail = result.logs
      .map((log) => {
        const l = log as { message?: string; position?: { file?: string; line?: number } };
        const where = l.position?.file
          ? ` (${l.position.file}${l.position.line ? `:${l.position.line}` : ""})`
          : "";
        return `  - ${l.message ?? String(log)}${where}`;
      })
      .join("\n");
    throw new Error(
      `Browser demo bundling failed on bun ${Bun.version} (${process.platform}/${process.arch})\n` +
        `entrypoints:\n${entrypoints.map((e) => `  - ${e}`).join("\n")}\n` +
        `logs:\n${detail}`,
    );
  }
  const artifacts = new Map<string, string>();
  for (const artifact of result.outputs) {
    const name = artifact.path.split("/").pop()!;
    artifacts.set(name, await artifact.text());
  }
  const assets = new Map<string, string>();
  for (const [served, artifact] of Object.entries(BUNDLE_ALIASES)) {
    const code = artifacts.get(artifact);
    if (code === undefined) throw new Error(`Missing bundle artifact ${artifact}`);
    assets.set(served, code);
  }
  return assets;
}

/** Editable example sources, re-read from disk on every request so edits show on reload. */
const SNIPPETS = new Set(["snippet-pls.js", "snippet-cbsem.js", "snippet-plot.js"]);

export async function createServer(port = 0) {
  const assets = await buildAssets();
  const indexHtml = await Bun.file(new URL("./index.html", import.meta.url)).text();

  return Bun.serve({
    port,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/") {
        return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      const name = path.slice(1);
      if (SNIPPETS.has(name)) {
        const source = await Bun.file(new URL(`./${name}`, import.meta.url)).text();
        return new Response(source, { headers: { "content-type": "text/javascript; charset=utf-8" } });
      }
      const asset = assets.get(name);
      if (asset !== undefined) {
        return new Response(asset, { headers: { "content-type": "text/javascript; charset=utf-8" } });
      }
      if (path === "/mobi.csv") {
        return new Response(await Bun.file(mobiCsvUrl).text(), {
          headers: { "content-type": "text/csv; charset=utf-8" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
}

if (import.meta.main) {
  const server = await createServer(3456);
  console.log(`seminr-ts browser demo: http://localhost:${server.port}`);
}
