import { describe, it, expect } from "bun:test";
import { version } from "../src/index.ts";

describe("toolchain smoke", () => {
  it("exposes the package version", () => {
    expect(version).toBe("0.1.0");
  });
});
