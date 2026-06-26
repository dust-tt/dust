import { describe, expect, it } from "vitest";

import { htmlToMarkdown } from "./html_to_markdown";

describe("htmlToMarkdown", () => {
  it("converts simple HTML to markdown", () => {
    expect(htmlToMarkdown("<p>Hello <strong>world</strong></p>")).toContain(
      "Hello"
    );
    expect(htmlToMarkdown("<p>Hello <strong>world</strong></p>")).toContain(
      "world"
    );
  });

  it("falls back to plain text for deeply nested markup", () => {
    let html = "deeply nested content";
    for (let i = 0; i < 3000; i++) {
      html = `<blockquote>${html}</blockquote>`;
    }

    expect(() => htmlToMarkdown(html)).not.toThrow();
    expect(htmlToMarkdown(html)).toContain("deeply nested content");
  });
});
