import { compareForFuzzySort } from "@app/lib/utils";

test("compareForFuzzySort should correctly compare strings", () => {
  const data = [
    { query: "eng", a: "eng", b: "ContentMarketing" },
    { query: "sql", a: "sqlGod", b: "sqlCoreGod" },
    { query: "sql", a: "sql", b: "sqlGod" },
    { query: "sql", a: "sql", b: "SEOQualityRater" },
    { query: "gp", a: "gpt-4", b: "GabHelp" },
    { query: "gp", a: "gpt-4", b: "gemni-pro" },
    { query: "start", a: "robotstart", b: "strongrt" },
    { query: "mygod", a: "ohmygodbot", b: "moatmode" },
    { query: "test", a: "test", b: "testlong" },
    { query: "test", a: "testlonger", b: "longtest" },
  ];

  for (const d of data) {
    expect(compareForFuzzySort(d.query, d.a, d.b)).toBeLessThan(0);
  }
});
