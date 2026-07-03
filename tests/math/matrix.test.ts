import { describe, it, expect } from "bun:test";
import {
  matmul,
  transpose,
  namedMatrix,
  nmGet,
  nmSet,
  zeros,
} from "../../src/math/matrix.ts";

describe("matmul", () => {
  it("multiplies two square matrices", () => {
    expect(
      matmul(
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ),
    ).toEqual([
      [19, 22],
      [43, 50],
    ]);
  });

  it("multiplies rectangular matrices (2x3 by 3x1)", () => {
    expect(
      matmul(
        [
          [1, 2, 3],
          [4, 5, 6],
        ],
        [[1], [0], [2]],
      ),
    ).toEqual([[7], [16]]);
  });
});

describe("transpose", () => {
  it("transposes a rectangular matrix", () => {
    expect(
      transpose([
        [1, 2, 3],
        [4, 5, 6],
      ]),
    ).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });
});

describe("zeros", () => {
  it("builds an all-zero matrix of the given shape", () => {
    expect(zeros(2, 3)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });
});

describe("namedMatrix", () => {
  it("creates a zero matrix addressable by row/col names", () => {
    const m = namedMatrix(["a", "b"], ["x", "y", "z"]);
    expect(m.values).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(nmGet(m, "b", "z")).toBe(0);
  });

  it("sets and gets cells by name", () => {
    const m = namedMatrix(["a", "b"], ["x", "y"]);
    nmSet(m, "a", "y", 3.5);
    expect(nmGet(m, "a", "y")).toBe(3.5);
    expect(m.values[0]![1]).toBe(3.5);
  });

  it("throws on an unknown row or column name", () => {
    const m = namedMatrix(["a"], ["x"]);
    expect(() => nmGet(m, "nope", "x")).toThrow(/nope/);
    expect(() => nmSet(m, "a", "nope", 1)).toThrow(/nope/);
  });

  it("wraps existing values without copying names into cells", () => {
    const m = namedMatrix(["r1"], ["c1", "c2"], [[7, 8]]);
    expect(nmGet(m, "r1", "c2")).toBe(8);
  });
});
