import {
  filterBySearchWords,
  matchesSearchWords,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { describe, expect, it } from "vitest";

describe("matchesSearchWords", () => {
  it("requires every query word to prefix a distinct text word", () => {
    expect(matchesSearchWords("Claude 4.5 Haiku High", "hai h")).toBe(true);
    expect(matchesSearchWords("Claude 4.5 Haiku Light", "hai h")).toBe(false);
    expect(matchesSearchWords("GPT-5.4 Mini Medium", "5.4 m m")).toBe(true);
    expect(matchesSearchWords("GPT-5.4 Mini Medium", "m m m")).toBe(false);
  });

  it("lets a query word span consecutive text words", () => {
    expect(matchesSearchWords("GPT 6 Astra High", "gpt6 h")).toBe(true);
    expect(matchesSearchWords("GPT 5.6 Luna High", "gpt5.6 lu")).toBe(true);
    expect(matchesSearchWords("Claude Sonnet 5 Light", "sonnet5")).toBe(true);
    // Spanned words are consumed: "6" cannot serve two query words.
    expect(matchesSearchWords("GPT 6 Astra High", "gpt6 6")).toBe(false);
  });

  it("is case-insensitive and ignores mid-word matches", () => {
    expect(matchesSearchWords("Claude Fable 5", "FAB")).toBe(true);
    expect(matchesSearchWords("Claude Fable 5", "able")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(matchesSearchWords("Premium", "  ")).toBe(true);
  });
});

describe("filterBySearchWords", () => {
  const labels = [
    "Premium",
    "GLM-5.2 High",
    "GLM-5.3 Flash Light",
    "GLM-5.3 Flash Medium",
    "GLM-5.3 Flash High",
    "Claude 4.5 Haiku Light",
    "Claude 4.5 Haiku High",
    "Claude Opus 5 Medium",
    "GPT 5.6 Sol Light",
  ];
  const filter = (query: string) =>
    filterBySearchWords(labels, query, (label) => label);

  it("falls back to a subsequence for a word that starts nothing", () => {
    expect(filter("glm3")).toEqual([
      "GLM-5.3 Flash Light",
      "GLM-5.3 Flash Medium",
      "GLM-5.3 Flash High",
    ]);
    expect(filter("clade")).toEqual([
      "Claude 4.5 Haiku Light",
      "Claude 4.5 Haiku High",
      "Claude Opus 5 Medium",
    ]);
  });

  it("keeps a word strict when it starts a word somewhere in the list", () => {
    // "h" starts "High", so it must not match "Flash" or "Light" loosely.
    expect(filter("glm3 h")).toEqual(["GLM-5.3 Flash High"]);
    expect(filter("haiku h")).toEqual(["Claude 4.5 Haiku High"]);
    // "op" starts "Opus", so it must not reach "Sol" as a subsequence.
    expect(filter("op")).toEqual(["Claude Opus 5 Medium"]);
    expect(filter("prem")).toEqual(["Premium"]);
  });

  it("keeps every item on an empty query and none on a miss", () => {
    expect(filter("")).toEqual(labels);
    expect(filter("zzz")).toEqual([]);
  });
});
