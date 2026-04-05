import { convertMarkdownToHtml } from "@app/lib/editor";
import { describe, expect, it } from "vitest";

describe("convertMarkdownToHtml", () => {
  it("converts plain text to HTML paragraphs", () => {
    const html = convertMarkdownToHtml("Hello world");
    expect(html).toContain("<p");
    expect(html).toContain("Hello world</p>");
  });

  it("converts headings", () => {
    const html = convertMarkdownToHtml("# Heading 1\n\n## Heading 2");
    expect(html).toContain("<h1");
    expect(html).toContain("Heading 1</h1>");
    expect(html).toContain("<h2");
    expect(html).toContain("Heading 2</h2>");
  });

  it("converts instruction blocks", () => {
    const html = convertMarkdownToHtml(
      "<instructions>\nhello\n</instructions>"
    );
    expect(html).toContain('data-type="instruction-block"');
    expect(html).toContain('data-instruction-type="instructions"');
    expect(html).toContain("hello");
  });

  it("converts nested instruction blocks", () => {
    const html = convertMarkdownToHtml(
      "<outer>\n<inner>\ntext\n</inner>\n</outer>"
    );
    expect(html).toContain('data-instruction-type="outer"');
    expect(html).toContain('data-instruction-type="inner"');
    expect(html).toContain("text");
  });

  it("converts bullet lists", () => {
    const html = convertMarkdownToHtml("- item 1\n- item 2\n- item 3");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>");
    expect(html).toContain("item 1");
    expect(html).toContain("item 2");
    expect(html).toContain("item 3");
  });

  it("converts ordered lists", () => {
    const html = convertMarkdownToHtml("1. first\n2. second");
    expect(html).toContain("<ol");
    expect(html).toContain("<li>");
    expect(html).toContain("first");
    expect(html).toContain("second");
  });

  it("converts fenced code blocks", () => {
    const html = convertMarkdownToHtml("```\ncode block\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code>");
    expect(html).toContain("code block");
  });

  it("converts inline code", () => {
    const html = convertMarkdownToHtml("Use `myFunction()` here");
    expect(html).toContain("<code>");
    expect(html).toContain("myFunction()");
  });

  it("converts links", () => {
    const html = convertMarkdownToHtml("[example](https://example.com)");
    expect(html).toContain("<a");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("example");
  });

  it("converts instruction blocks with headings and lists inside", () => {
    const md = `<instructions>
# Title

Some text

- item 1
- item 2
</instructions>`;
    const html = convertMarkdownToHtml(md);
    expect(html).toContain('data-type="instruction-block"');
    expect(html).toContain("<h1");
    expect(html).toContain("Title</h1>");
    expect(html).toContain("<ul");
    expect(html).toContain("item 1");
  });

  it("handles empty instruction blocks without crashing", () => {
    expect(() => convertMarkdownToHtml("<foo>\n</foo>")).not.toThrow();
    const html = convertMarkdownToHtml("<foo>\n</foo>");
    expect(html).toContain('data-instruction-type="foo"');
  });

  it("strips style and class attributes from output", () => {
    const html = convertMarkdownToHtml("# Heading\n\nParagraph");
    expect(html).not.toMatch(/\bstyle="/);
    expect(html).not.toMatch(/\bclass="/);
  });

  it("preserves data attributes on instruction blocks", () => {
    const html = convertMarkdownToHtml(
      "<instructions>\nhello\n</instructions>"
    );
    expect(html).toContain("data-type=");
    expect(html).toContain("data-instruction-type=");
  });

  it("adds data-block-id to block-level elements", () => {
    const html = convertMarkdownToHtml("# Heading\n\nParagraph\n\n- item");
    const blockIdMatches = html.match(/data-block-id="[a-f0-9]{8}"/g);
    expect(blockIdMatches).not.toBeNull();
    expect(blockIdMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("handles tags with attributes by keeping them escaped", () => {
    const md = `<task type="main">
content
</task>`;
    expect(() => convertMarkdownToHtml(md)).not.toThrow();
  });

  it("handles deeply nested instruction blocks", () => {
    const md = `<prompt>
<instructions>
<do>
something
</do>
</instructions>
</prompt>`;
    const html = convertMarkdownToHtml(md);
    expect(html).toContain('data-instruction-type="prompt"');
    expect(html).toContain("something");
  });

  it("converts bold and italic", () => {
    const html = convertMarkdownToHtml("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("wraps output in instructions-root div", () => {
    const html = convertMarkdownToHtml("Hello");
    expect(html).toMatch(
      /^<div data-type="instructions-root" data-block-id="instructions-root">/
    );
    expect(html).toMatch(/<\/div>$/);
    expect(html).toContain("Hello</p>");
  });
});
