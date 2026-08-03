import {
  compareForAutocompleteSort,
  compareForFuzzySort,
  subFilter,
} from "@app/lib/utils";
import { describe, expect, test } from "vitest";

const AUTOCOMPLETE_SKILL_NAMES = [
  "Guide",
  "Guide Builder",
  "Guideline Toolkit",
  "Create Guide",
  "Product Guides",
  "Generate Useful Insights for Data Export",
  "Guiding Workshop",
  "Automation Designer",
];

function filterAndSortAutocompleteSkills(query: string): string[] {
  const normalizedQuery = query.toLowerCase();

  return AUTOCOMPLETE_SKILL_NAMES.filter((name) =>
    subFilter(normalizedQuery, name.toLowerCase())
  ).toSorted((a, b) => compareForAutocompleteSort(query, a, b));
}

describe("compareForAutocompleteSort", () => {
  test.each([
    {
      behavior:
        "ranks exact, prefix, substring, and fuzzy matches in that order",
      query: "guide",
      expected: [
        "Guide",
        "Guide Builder",
        "Guideline Toolkit",
        "Create Guide",
        "Product Guides",
        "Generate Useful Insights for Data Export",
      ],
    },
    {
      behavior: "prioritizes shorter matches within the prefix tier",
      query: "guid",
      expected: [
        "Guide",
        "Guide Builder",
        "Guiding Workshop",
        "Guideline Toolkit",
        "Create Guide",
        "Product Guides",
        "Generate Useful Insights for Data Export",
      ],
    },
    {
      behavior: "ranks a title prefix above fuzzy title matches",
      query: "gen",
      expected: [
        "Generate Useful Insights for Data Export",
        "Guideline Toolkit",
      ],
    },
    {
      behavior: "sorts fuzzy-only matches by length instead of by spread",
      query: "gde",
      expected: [
        "Guide",
        "Create Guide",
        "Guide Builder",
        "Product Guides",
        "Guideline Toolkit",
        "Generate Useful Insights for Data Export",
      ],
    },
    {
      behavior: "matches a query case-insensitively",
      query: "GUIDE",
      expected: [
        "Guide",
        "Guide Builder",
        "Guideline Toolkit",
        "Create Guide",
        "Product Guides",
        "Generate Useful Insights for Data Export",
      ],
    },
    {
      behavior: "returns the single matching prefix without unrelated skills",
      query: "create",
      expected: ["Create Guide"],
    },
    {
      behavior: "returns an empty list when no skill matches",
      query: "zzz",
      expected: [],
    },
    {
      behavior: "sorts every skill alphabetically when the query is empty",
      query: "",
      expected: [
        "Automation Designer",
        "Create Guide",
        "Generate Useful Insights for Data Export",
        "Guide",
        "Guide Builder",
        "Guideline Toolkit",
        "Guiding Workshop",
        "Product Guides",
      ],
    },
  ])("$behavior for '$query'", ({ query, expected }) => {
    expect(filterAndSortAutocompleteSkills(query)).toEqual(expected);
  });

  test.each([
    {
      behavior: "an exact match ranks above a longer prefix match",
      query: "guide",
      betterMatch: "Guide",
      worseMatch: "Guide Builder",
    },
    {
      behavior:
        "a prefix match ranks above a substring match even when it is later alphabetically",
      query: "guide",
      betterMatch: "Guide Builder",
      worseMatch: "Create Guide",
    },
    {
      behavior:
        "a substring match ranks above a fuzzy match even when it is later alphabetically",
      query: "guide",
      betterMatch: "Product Guides",
      worseMatch: "Generate Useful Insights for Data Export",
    },
    {
      behavior:
        "a fuzzy match ranks above a non-match even when it is later alphabetically",
      query: "guide",
      betterMatch: "Generate Useful Insights for Data Export",
      worseMatch: "Automation Designer",
    },
    {
      behavior:
        "a shorter prefix match ranks first even when it is later alphabetically",
      query: "guid",
      betterMatch: "Guiding Lab",
      worseMatch: "Guide Automation",
    },
    {
      behavior:
        "equally positioned and equally short prefix matches are ordered alphabetically",
      query: "guid",
      betterMatch: "Guide Alpha",
      worseMatch: "Guide Bravo",
    },
    {
      behavior:
        "equally positioned and equally short substring matches are ordered alphabetically",
      query: "guide",
      betterMatch: "Create Guide A",
      worseMatch: "Create Guide B",
    },
    {
      behavior: "equally short fuzzy matches are ordered alphabetically",
      query: "gde",
      betterMatch: "Great Data Export",
      worseMatch: "Green Data Engine",
    },
    {
      behavior: "two non-matches are ordered alphabetically",
      query: "guide",
      betterMatch: "Automation Designer",
      worseMatch: "Workflow Runner",
    },
    {
      behavior: "a multi-word prefix ranks above the same substring",
      query: "guide b",
      betterMatch: "Guide Builder",
      worseMatch: "Create Guide Builder",
    },
    {
      behavior:
        "an earlier substring ranks first even when it is longer and later alphabetically",
      query: "guide",
      betterMatch: "Use Guide Reference",
      worseMatch: "A Very Long Guide",
    },
    {
      behavior:
        "a shorter substring ranks first when both matches start at the same position",
      query: "guide",
      betterMatch: "Zoo Guide",
      worseMatch: "Any Guide Reference",
    },
  ])("$behavior", ({ query, betterMatch, worseMatch }) => {
    expect(
      [worseMatch, betterMatch].toSorted((a, b) =>
        compareForAutocompleteSort(query, a, b)
      )
    ).toEqual([betterMatch, worseMatch]);
  });

  test("uses original casing as the final alphabetical tie-breaker", () => {
    const comparison = compareForAutocompleteSort("guide", "Guide", "GUIDE");
    const reverseComparison = compareForAutocompleteSort(
      "guide",
      "GUIDE",
      "Guide"
    );

    expect(comparison).not.toBe(0);
    expect(Math.sign(comparison)).toBe(-Math.sign(reverseComparison));
  });

  test("ranks matching candidates before non-matches in an unfiltered list", () => {
    expect(
      ["Automation Designer", "Create Guide", "Guide"].toSorted((a, b) =>
        compareForAutocompleteSort("guide", a, b)
      )
    ).toEqual(["Guide", "Create Guide", "Automation Designer"]);
  });
});

test("compareForFuzzySort should correctly compare strings", () => {
  const dataLessThan = [
    { query: "eng", a: "eng", b: "ContentMarketing" },
    { query: "sql", a: "sql", b: "sqlGod" },
    { query: "sql", a: "sql", b: "SEOQualityRater" },
    { query: "gp", a: "gpt-4", b: "GabHelp" },
    { query: "gp", a: "gpt-4", b: "gemni-pro" },
    { query: "start", a: "robotstart", b: "strongrt" },
    { query: "mygod", a: "ohmygodbot", b: "moatmode" },
    { query: "test", a: "test", b: "testlong" },
    { query: "eng", a: "eng", b: "slack-engineering-highlights" },
    { query: "c", a: "c", b: "RadicalFeedback" },
    { query: "issuebot", a: "issueBot", b: "FDEIssueBot" },
    { query: "issuebot", a: "ISSUEBOT", b: "FDEIssueBot" },
  ];

  const dataEqual = [
    { query: "sql", a: "sqlGod", b: "sqlGod" },
    { query: "eng", a: "eng1", b: "eng2" },
    { query: "gp", a: "gpt-4", b: "gpt-5" },
    { query: "test", a: "testl", b: "testlong" },
    { query: "test", a: "testlonger", b: "longtest" },
  ];

  for (const d of dataLessThan) {
    expect(
      compareForFuzzySort(d.query, d.a, d.b),
      `Expected compareForFuzzySort("${d.query}", "${d.a}", "${d.b}") to be less than 0`
    ).toBeLessThan(0);
  }

  for (const d of dataEqual) {
    expect(
      compareForFuzzySort(d.query, d.a, d.b),
      `Expected compareForFuzzySort("${d.query}", "${d.a}", "${d.b}") to return 0`
    ).toBe(0);
  }
});

test("compareForFuzzySort stays symmetric for normalized exact matches", () => {
  const query = "\u0130";
  const normalizedExactMatch = "i\u0307";

  expect(compareForFuzzySort(query, query, normalizedExactMatch)).toBe(0);
  expect(compareForFuzzySort(query, normalizedExactMatch, query)).toBe(0);
});
