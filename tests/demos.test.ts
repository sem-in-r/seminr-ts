/**
 * Slice 10: seminr-style demos. Each CLI demo must run cleanly under
 * `bun run demos/<name>.ts` and print its key result sections; the browser
 * demo's server must build browser bundles and serve every asset.
 */
import { describe, it, expect } from "bun:test";

const repoRoot = new URL("..", import.meta.url).pathname;

async function runDemo(script: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", script], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

const cliDemos: Array<{ script: string; markers: string[] }> = [
  {
    script: "demos/pls-ecsi.ts",
    markers: ["Path coefficients", "R-squared", "Outer loadings", "Bootstrapped paths", "Satisfaction"],
  },
  {
    script: "demos/plsc-ecsi.ts",
    markers: ["Consistent PLS (PLSc)", "Path coefficients", "rho_A", "Satisfaction"],
  },
  {
    script: "demos/pls-interaction.ts",
    markers: ["product_indicator", "orthogonal", "two_stage", "Image*Expectation"],
  },
  {
    script: "demos/pls-higher-order.ts",
    markers: ["higher-order", "First-stage", "Path coefficients", "Satisfaction"],
  },
  {
    script: "demos/alternative-models.ts",
    markers: ["Alternative", "R-squared", "Loyalty"],
  },
];

describe("CLI demos", () => {
  for (const demo of cliDemos) {
    it(`${demo.script} runs and prints its result sections`, async () => {
      const { exitCode, stdout, stderr } = await runDemo(demo.script);
      expect(stderr.trim(), `stderr of ${demo.script}`).toBe("");
      expect(exitCode).toBe(0);
      for (const marker of demo.markers) {
        expect(stdout, `expected "${marker}" in ${demo.script} output`).toContain(marker);
      }
    }, 30000);
  }
});

describe("browser demo server", () => {
  it("serves the page, browser bundles, and dataset", async () => {
    const { createServer } = await import("../demos/browser/serve.ts");
    const server = await createServer(0);
    try {
      const base = `http://localhost:${server.port}`;
      const page = await fetch(`${base}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("semints");

      const app = await fetch(`${base}/app.js`);
      expect(app.status).toBe(200);
      const appCode = await app.text();
      expect(appCode).not.toContain('from "node:');

      const worker = await fetch(`${base}/worker.js`);
      expect(worker.status).toBe(200);

      const csv = await fetch(`${base}/mobi.csv`);
      expect(csv.status).toBe(200);
      expect((await csv.text()).length).toBeGreaterThan(1000);
    } finally {
      server.stop(true);
    }
  }, 30000);
});
