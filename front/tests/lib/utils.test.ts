import { compareForFuzzySort } from "@app/lib/utils";
import { expect, test } from "vitest";

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
    { query: "test", a: "testlonger", b: "longtest" },
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
