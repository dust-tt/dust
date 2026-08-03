import {
  compareForAutocompleteSort,
  compareForFuzzySort,
  subFilter,
} from "@app/lib/utils";
import { describe, expect, test } from "vitest";

const AUTOCOMPLETE_SKILL_NAMES = [
  "Guide",
  "Guide Builder",
  "Guide Analytics",
  "Guidebook Publisher",
  "Guideline Toolkit",
  "Guided Tour",
  "Create Guide",
  "Draft A Guide",
  "Product Guides",
  "Team Guide Catalog",
  "Generate Useful Insights for Data Export",
  "Great User Interface Design Example",
  "Gather Updates Into Detailed Email",
  "Guidance Planner",
  "Guiding Workshop",
  "Automation Designer",
  "Workflow Runner",
  "Knowledge Organizer",
  "Audit Checklist",
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
        "Guided Tour",
        "Guide Builder",
        "Guide Analytics",
        "Guideline Toolkit",
        "Guidebook Publisher",
        "Team Guide Catalog",
        "Create Guide",
        "Draft A Guide",
        "Product Guides",
        "Guidance Planner",
        "Gather Updates Into Detailed Email",
        "Great User Interface Design Example",
        "Generate Useful Insights for Data Export",
      ],
    },
    {
      behavior: "prioritizes shorter matches within the prefix tier",
      query: "guid",
      expected: [
        "Guide",
        "Guided Tour",
        "Guide Builder",
        "Guide Analytics",
        "Guidance Planner",
        "Guiding Workshop",
        "Guideline Toolkit",
        "Guidebook Publisher",
        "Team Guide Catalog",
        "Create Guide",
        "Draft A Guide",
        "Product Guides",
        "Gather Updates Into Detailed Email",
        "Great User Interface Design Example",
        "Generate Useful Insights for Data Export",
      ],
    },
    {
      behavior: "ranks a title prefix above fuzzy title matches",
      query: "gen",
      expected: [
        "Generate Useful Insights for Data Export",
        "Guide Analytics",
        "Guidance Planner",
        "Guideline Toolkit",
        "Knowledge Organizer",
        "Gather Updates Into Detailed Email",
        "Great User Interface Design Example",
      ],
    },
    {
      behavior: "sorts fuzzy-only matches by length instead of by spread",
      query: "gde",
      expected: [
        "Guide",
        "Guided Tour",
        "Create Guide",
        "Draft A Guide",
        "Guide Builder",
        "Product Guides",
        "Guide Analytics",
        "Guidance Planner",
        "Guideline Toolkit",
        "Team Guide Catalog",
        "Guidebook Publisher",
        "Gather Updates Into Detailed Email",
        "Great User Interface Design Example",
        "Generate Useful Insights for Data Export",
      ],
    },
    {
      behavior: "matches a query case-insensitively",
      query: "GUIDE",
      expected: [
        "Guide",
        "Guided Tour",
        "Guide Builder",
        "Guide Analytics",
        "Guideline Toolkit",
        "Guidebook Publisher",
        "Team Guide Catalog",
        "Create Guide",
        "Draft A Guide",
        "Product Guides",
        "Guidance Planner",
        "Gather Updates Into Detailed Email",
        "Great User Interface Design Example",
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
        "Audit Checklist",
        "Automation Designer",
        "Create Guide",
        "Draft A Guide",
        "Gather Updates Into Detailed Email",
        "Generate Useful Insights for Data Export",
        "Great User Interface Design Example",
        "Guidance Planner",
        "Guide",
        "Guide Analytics",
        "Guide Builder",
        "Guidebook Publisher",
        "Guided Tour",
        "Guideline Toolkit",
        "Guiding Workshop",
        "Knowledge Organizer",
        "Product Guides",
        "Team Guide Catalog",
        "Workflow Runner",
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
    {
      behavior:
        "a substring match beats a much shorter fuzzy candidate because match tier wins first",
      query: "guide",
      betterMatch: "Create A Comprehensive Guide",
      worseMatch: "G-u-i-d-e",
    },
    {
      behavior:
        "the first occurrence determines position when a candidate contains the query twice",
      query: "guide",
      betterMatch: "Use Guide Then Guide",
      worseMatch: "Build A Detailed Guide",
    },
    {
      behavior: "a prefix followed by punctuation still ranks as a prefix",
      query: "guide-",
      betterMatch: "Guide-Builder",
      worseMatch: "Create Guide-Builder",
    },
    {
      behavior: "Unicode casing is normalized when assigning match tiers",
      query: "ÉTUDE",
      betterMatch: "Étude",
      worseMatch: "Étude Builder",
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

  test("returns a tie for identical candidates", () => {
    expect(compareForAutocompleteSort("guide", "Guide", "Guide")).toBe(0);
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
