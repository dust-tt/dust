import { normalizeHref } from "@app/components/editor/document/DocumentSelectionToolbar";
import { describe, expect, it } from "vitest";

describe("normalizeHref", () => {
  it.each([
    ["https://dust.tt/docs", "https://dust.tt/docs"],
    ["  http://dust.tt  ", "http://dust.tt/"],
    ["dust.tt/docs", "https://dust.tt/docs"],
    ["localhost:3000", "https://localhost:3000/"],
    ["mailto:team@dust.tt", "mailto:team@dust.tt"],
  ])("keeps %s as a link to %s", (value, href) => {
    expect(normalizeHref(value)).toBe(href);
  });

  it.each([
    "",
    "   ",
    "javascript:alert(1)",
    "data:text/html,hi",
    "ftp://dust.tt",
    "https://",
    "hello world",
    "#heading",
    "mailto:",
  ])("refuses %j", (value) => {
    expect(normalizeHref(value)).toBeNull();
  });
});
