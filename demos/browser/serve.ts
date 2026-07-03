/**
 * Dev server for the browser demo. Bundles app.ts and the bootstrap worker
 * for the browser target on startup, then serves them with the page and the
 * mobi dataset.
 *
 * Run: bun run demos/browser/serve.ts   (then open the printed URL)
 */
import { mobiCsvUrl } from "../lib/mobi.ts";

async function buildAssets(): Promise<Map<string, string>> {
  const result = await Bun.build({
    entrypoints: [
      new URL("./app.ts", import.meta.url).pathname,
      new URL("../../src/bootstrap/worker.ts", import.meta.url).pathname,
    ],
    target: "browser",
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Browser demo bundling failed");
  }
  const assets = new Map<string, string>();
  for (const artifact of result.outputs) {
    const name = artifact.path.split("/").pop()!;
    assets.set(name, await artifact.text());
  }
  return assets;
}

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
      const asset = assets.get(path.slice(1));
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
