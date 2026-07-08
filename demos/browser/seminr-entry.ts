/**
 * Browser-bundle entry for the demo's public `seminr` API.
 *
 * Why this exists instead of pointing Bun.build at `src/index.ts` directly:
 * Bun.build (1.3.14) tree-shakes away every definition when the ENTRYPOINT is a
 * pure re-export barrel — `src/index.ts` bundled as an entrypoint collapses to a
 * bare `export { … }` list with no code, so the served `/seminr.js` "exports"
 * MmMatrix et al. but never defines them (`Export 'MmMatrix' is not defined in
 * module` at import time). Re-wrapping the barrel one level down with `export *`
 * makes the barrel a dependency rather than the entrypoint, and Bun keeps the
 * implementations. See demos/browser/serve.ts.
 */
export * from "../../src/index.ts";
