// @vitest-environment node
import {
  getDocumentTheme,
  withDocumentTheme,
} from "@app/lib/editor/document_themes";
import { describe, expect, it } from "vitest";

describe("getDocumentTheme", () => {
  it.each([
    ["theme: memo", "memo"],
    ['theme: "report"', "report"],
    ["theme: 'memo'", "memo"],
    ["theme :memo  # serif", "memo"],
    ["title: Notes\ntheme: report\ntags: [a, b]", "report"],
  ])("reads %j", (frontMatter, theme) => {
    expect(getDocumentTheme(frontMatter)).toBe(theme);
  });

  it.each([
    ["no front matter", null],
    ["empty front matter", ""],
    ["no theme key", "title: Notes"],
    ["an unknown theme", "theme: fancy"],
    ["a theme in another case", "theme: Memo"],
    ["mismatched quotes", "theme: \"memo'"],
    ["a repeated key", "theme: memo\ntheme: report"],
    ["a repeated key with an invalid value", "theme: memo\ntheme: [x]"],
    ["a nested key", "dust:\n  theme: memo"],
    ["a block value", "theme: >\n  memo"],
    ["a value with trailing text", "theme: memo report"],
  ])("falls back to the default for %s", (_, frontMatter) => {
    expect(getDocumentTheme(frontMatter)).toBe("default");
  });
});

describe("withDocumentTheme", () => {
  it.each([
    ["adds front matter", null, "memo", "theme: memo"],
    ["fills empty front matter", "", "report", "theme: report"],
    ["appends the key", "title: Notes", "memo", "title: Notes\ntheme: memo"],
    [
      "replaces the key in place",
      "title: Notes\ntheme: memo # serif\ntags: [a]",
      "report",
      "title: Notes\ntheme: report\ntags: [a]",
    ],
    [
      "replaces an unknown theme",
      "theme: fancy\ntitle: Notes",
      "memo",
      "theme: memo\ntitle: Notes",
    ],
    [
      "removes the key for the default",
      "title: Notes\ntheme: memo",
      "default",
      "title: Notes",
    ],
    ["drops front matter left blank", "theme: memo", "default", null],
    [
      "keeps front matter already on the theme",
      'theme: "memo"',
      "memo",
      'theme: "memo"',
    ],
    ["keeps front matter without a theme for the default", "", "default", ""],
  ] as const)("%s", (_, frontMatter, theme, expected) => {
    const result = withDocumentTheme(frontMatter, theme);
    expect(result.isOk() && result.value).toBe(expected);
    expect(getDocumentTheme(expected)).toBe(theme);
  });

  it.each([
    ["a repeated key", "theme: memo\ntheme: report"],
    ["a block value", "theme: >\n  memo"],
    ["a nested value", "theme:\n  name: memo"],
  ])("refuses %s", (_, frontMatter) => {
    expect(withDocumentTheme(frontMatter, "report").isErr()).toBe(true);
  });
});
