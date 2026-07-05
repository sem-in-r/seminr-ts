/**
 * Dev server for the browser demo. Bundles the runner (app.ts), the shared
 * worker, the library (served as /semints.js), and the print helpers (served
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
  "semints.js": "semints-entry.js",
  "demo-utils.js": "print.js",
};

async function buildAssets(): Promise<Map<string, string>> {
  const result = await Bun.build({
    entrypoints: [
      Bun.fileURLToPath(new URL("./app.ts", import.meta.url)),
      Bun.fileURLToPath(new URL("../../src/workers/worker.ts", import.meta.url)),
      Bun.fileURLToPath(new URL("./semints-entry.ts", import.meta.url)),
      Bun.fileURLToPath(new URL("../lib/print.ts", import.meta.url)),
    ],
    target: "browser",
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Browser demo bundling failed");
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
const SNIPPETS = new Set(["snippet-pls.js", "snippet-cbsem.js"]);

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
  console.log(`semints browser demo: http://localhost:${server.port}`);
}
