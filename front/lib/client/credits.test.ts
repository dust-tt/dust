import { describe, expect, it } from "vitest";
import { formatAvgCredits } from "./credits";

describe("formatAvgCredits", () => {
  it.each([
    [310, "310.0"],
    [46.12, "46.1"],
    [1748.95, "1,749.0"],
    [0, "0.0"],
  ])("formats %s with exactly one decimal", (credits, expected) => {
    expect(formatAvgCredits(credits)).toBe(expected);
  });
});
