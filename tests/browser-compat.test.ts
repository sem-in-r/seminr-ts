/**
 * Guard: the library source must stay browser-safe. Bundling for the browser
 * target must succeed with zero runtime-specific imports (no node:*, no bun:*).
 */
import { describe, it, expect } from "bun:test";

const entrypoints = [
  Bun.fileURLToPath(new URL("../src/index.ts", import.meta.url)),
  Bun.fileURLToPath(new URL("../src/workers/worker.ts", import.meta.url)),
];

describe("browser compatibility", () => {
  it("bundles for the browser target with no node:/bun: imports", async () => {
    const result = await Bun.build({
      entrypoints,
      target: "browser",
    });
    expect(result.success).toBe(true);
    for (const artifact of result.outputs) {
      const code = await artifact.text();
      expect(code).not.toMatch(/require\(["']node:/);
      expect(code).not.toMatch(/from\s*["']node:/);
      expect(code).not.toMatch(/["']bun:/);
    }
  });
});
