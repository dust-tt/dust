import { matchesSearchWords } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { describe, expect, it } from "vitest";

describe("matchesSearchWords", () => {
  it("requires every query word to prefix a text word", () => {
    expect(matchesSearchWords("Pick model", "mo")).toBe(true);
    expect(matchesSearchWords("Pick model", "pick mo")).toBe(true);
    expect(matchesSearchWords("Pick model", "odel")).toBe(false);
    expect(matchesSearchWords("Attach-knowledge", "KNOW")).toBe(true);
  });

  it("matches everything on an empty query", () => {
    expect(matchesSearchWords("Premium", "  ")).toBe(true);
  });
});
