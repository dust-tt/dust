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
      behavior: "sorts matches alphabetically within the prefix tier",
      query: "guid",
      expected: [
        "Guide",
        "Guide Builder",
        "Guideline Toolkit",
        "Guiding Workshop",
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
      behavior: "sorts fuzzy-only matches alphabetically instead of by spread",
      query: "gde",
      expected: [
        "Create Guide",
        "Generate Useful Insights for Data Export",
        "Guide",
        "Guide Builder",
        "Guideline Toolkit",
        "Product Guides",
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
