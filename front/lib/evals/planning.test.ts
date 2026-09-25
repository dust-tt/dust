import { describe, expect, it } from "vitest";
import { caseCoordinates, caseCount } from "./planning";
import type { EvalConfig } from "./types";

const config = { rows: [{}, {}], variants: [{}, {}, {}], repetitions: 2 } as EvalConfig;
describe("durable eval case planning", () => {
  it("expands every row, variant and repetition exactly once", () => {
    expect(caseCount(config)).toBe(12);
    const coordinates = Array.from({ length: 12 }, (_, i) => caseCoordinates(config, i));
    expect(new Set(coordinates.map((c) => JSON.stringify(c))).size).toBe(12);
    expect(coordinates[0]).toEqual({ rowIndex: 0, variantIndex: 0, repetition: 0 });
    expect(coordinates[11]).toEqual({ rowIndex: 1, variantIndex: 2, repetition: 1 });
  });
  it("rejects negative, fractional and out-of-range case indexes", () => {
    for (const i of [-1, 0.5, 12, NaN]) {
      expect(() => caseCoordinates(config, i)).toThrow("Invalid case index");
    }
  });
});
