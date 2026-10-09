// @vitest-environment node
import { getDocumentTheme } from "@app/lib/editor/document_themes";
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
