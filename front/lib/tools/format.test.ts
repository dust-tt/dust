import { describe, expect, it } from "vitest";

import { parseToolTag, TOOL_TAG_REGEX } from "./format";

describe("tool tags", () => {
  it("parses a tag whose separator is more than one space", () => {
    expect(parseToolTag('<tool  id="tol_A" name="Search" />')).toMatchObject({
      id: "tol_A",
      name: "Search",
    });
  });

  it("rejects repeated malformed openings without rescanning the input", () => {
    const startedAt = performance.now();
    const matches = [..."<tool ".repeat(16_000).matchAll(TOOL_TAG_REGEX)];

    expect(performance.now() - startedAt).toBeLessThan(50);
    expect(matches).toEqual([]);
  });

  it("still matches a valid tag after a malformed opening", () => {
    const content = '<tool <tool id="tol_A" name="Search" />';

    expect(
      [...content.matchAll(TOOL_TAG_REGEX)].map((match) => match[0])
    ).toEqual(['<tool id="tol_A" name="Search" />']);
  });
});
