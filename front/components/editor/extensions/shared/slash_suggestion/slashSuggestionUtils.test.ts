import { matchesSearchWords } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { describe, expect, it } from "vitest";

describe("matchesSearchWords", () => {
  it("requires every query word to prefix a distinct text word", () => {
    expect(matchesSearchWords("Claude 4.5 Haiku High", "hai h")).toBe(true);
    expect(matchesSearchWords("Claude 4.5 Haiku Light", "hai h")).toBe(false);
    expect(matchesSearchWords("GPT-5.4 Mini Medium", "5.4 m m")).toBe(true);
    expect(matchesSearchWords("GPT-5.4 Mini Medium", "m m m")).toBe(false);
  });

  it("is case-insensitive and ignores mid-word matches", () => {
    expect(matchesSearchWords("Claude Fable 5", "FAB")).toBe(true);
    expect(matchesSearchWords("Claude Fable 5", "able")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(matchesSearchWords("Premium", "  ")).toBe(true);
  });
});
