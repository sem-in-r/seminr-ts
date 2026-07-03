import { describe, it, expect } from "bun:test";
import { parseCsv } from "../../src/data/csv.ts";

describe("parseCsv", () => {
  it("parses a header row and numeric records", () => {
    expect(parseCsv("a,b\n1,2\n3,4\n")).toEqual({
      columns: ["a", "b"],
      values: [
        [1, 2],
        [3, 4],
      ],
    });
  });

  it("strips quotes from header cells (R write.csv style)", () => {
    expect(parseCsv('"IMAG1","IMAG2"\n7,6\n').columns).toEqual(["IMAG1", "IMAG2"]);
  });

  it("tolerates CRLF line endings and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual({ columns: ["a", "b"], values: [[1, 2]] });
  });

  it("parses NA and empty cells as NaN", () => {
    const data = parseCsv("a,b\nNA,2\n3,\n");
    expect(data.values[0]![0]).toBeNaN();
    expect(data.values[1]![1]).toBeNaN();
    expect(data.values[0]![1]).toBe(2);
  });

  it("rejects rows whose width differs from the header", () => {
    expect(() => parseCsv("a,b\n1,2,3\n")).toThrow(/row 1/);
  });
});
