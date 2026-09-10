import {
  buildSkillMatchQuery,
  compareRankedSkills,
  getSearchRankingScore,
  getSkillSearchScore,
} from "@app/lib/skill_search/ranking";
import { describe, expect, it } from "vitest";

describe("shared skill ranking", () => {
  it.each([
    ["", "Anything", "", 1],
    ["skill", "SKILL", "", 100],
    ["skill", "Skill builder", "", 80],
    ["skill", "My skill", "", 60],
    ["sand", "Search And Navigate Data", "", 40],
    ["skill", "Other", "Find a skill", 20],
    ["sand", "Other", "Search And Navigate Data", 10],
    ["missing", "Other", "Description", 0],
    ["*?\\", "*?\\", "", 100],
    ["a.b", "axb", "", 0],
    ["ab", "A\nB", "", 40],
    ["skill", "skill\n", "", 80],
    ["😀", "A😀B", "", 60],
    // ES 8 wildcard case folding is ASCII-only, not JS Unicode /iu matching.
    ["Ä", "ä", "", 0],
    ["Ä", "Ä", "", 100],
    ["k", "K", "", 0],
  ])("scores %j against %j consistently with ES", (searchTerm, name, description, expected) => {
    expect(
      getSkillSearchScore({ searchTerm, name, description, mode: "discovery" })
    ).toBe(expected);
  });

  it("uses the best name or alias match and does not add weaker matches", () => {
    expect(
      getSkillSearchScore({
        searchTerm: "deep dive",
        name: "Go Deep",
        aliases: ["Deep Dive"],
        description: "Deep dive into research",
      })
    ).toBe(100);
    const query = buildSkillMatchQuery("deep dive", "discovery");
    expect(query.dis_max?.tie_breaker).toBe(0);
    expect(
      query.dis_max?.queries.map((clause) => clause.constant_score?.boost)
    ).toEqual([100, 80, 60, 40, 20, 10]);
  });

  it("autocomplete ignores description-only matches and usage", () => {
    expect(
      getSkillSearchScore({
        searchTerm: "research",
        name: "Other",
        description: "research",
      })
    ).toBe(0);
    expect(buildSkillMatchQuery("research").dis_max?.queries).toHaveLength(4);
    expect(
      getSearchRankingScore({
        matchScore: 80,
        mode: "autocomplete",
        activeUsers: 1000,
      })
    ).toBe(80);
  });

  it("management ranks by usage and discovery adds logarithmic usage", () => {
    expect(
      getSearchRankingScore({
        matchScore: 100,
        mode: "management",
        activeUsers: 4,
      })
    ).toBe(5);
    expect(
      getSearchRankingScore({
        matchScore: 20,
        mode: "management",
        activeUsers: 5,
      })
    ).toBe(6);
    expect(
      getSearchRankingScore({
        matchScore: 80,
        mode: "discovery",
        activeUsers: 9,
      })
    ).toBe(Math.fround(80 + Math.log1p(9)));
    expect(
      getSearchRankingScore({
        matchScore: 0,
        mode: "management",
        activeUsers: 1000,
      })
    ).toBe(0);
  });

  it("handles long failing subsequences without regex backtracking", () => {
    expect(
      getSkillSearchScore({
        searchTerm: `${"a".repeat(199)}b`,
        name: "a".repeat(1000),
        description: "a".repeat(10000),
      })
    ).toBe(0);
  });

  it("breaks ties in ES keyword byte order, including supplementary Unicode", () => {
    const ranked = [
      { score: 40, name: "same", sId: "b" },
      { score: 40, name: "same", sId: "a" },
      { score: 40, name: "😀", sId: "emoji" },
      { score: 40, name: "\uE000", sId: "bmp" },
      { score: 100, name: "Z", sId: "exact" },
    ].sort(compareRankedSkills);
    expect(ranked.map((item) => item.sId)).toEqual([
      "exact",
      "a",
      "b",
      "bmp",
      "emoji",
    ]);
  });

  it("uses the tie-breaker when ES serializes the same float32 score with fewer digits", () => {
    const codeDefined = {
      score: Math.fround(100 + Math.log1p(7)),
      name: "A",
      sId: "global",
    };
    const indexed = { score: 102.079445, name: "Z", sId: "custom" };
    expect(compareRankedSkills(codeDefined, indexed)).toBeLessThan(0);
    expect(compareRankedSkills(indexed, codeDefined)).toBeGreaterThan(0);
  });
});
