import {
  RawMarkdownBlock,
  rawMarkdownBlockParsers,
} from "@app/components/editor/extensions/skill_builder/RawMarkdownBlock";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("RawMarkdownBlock", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([RawMarkdownBlock, ...rawMarkdownBlockParsers], {
      starterKit: { blockquote: false, horizontalRule: false },
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  function rawBlocks(e: Editor) {
    return (
      e
        .getJSON()
        .content?.filter((n: { type: string }) => n.type === "rawMarkdownBlock")
        .map((n: { attrs?: { rawContent?: string } }) => n.attrs?.rawContent) ??
      []
    );
  }

  describe("markdown token parsing", () => {
    it("captures a markdown table as a raw block", () => {
      const table = "| a | b |\n|---|---|\n| 1 | 2 |";
      editor.commands.setContent(table, { contentType: "markdown" });

      const blocks = rawBlocks(editor);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain("| a | b |");
    });

    it("captures a horizontal rule as a raw block", () => {
      editor.commands.setContent("---", { contentType: "markdown" });

      const blocks = rawBlocks(editor);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatch(/^-{3}/);
    });

    it("captures a blockquote as a raw block", () => {
      editor.commands.setContent("> quoted text", { contentType: "markdown" });

      const blocks = rawBlocks(editor);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain("> quoted text");
    });

    it("captures a link definition as a raw block", () => {
      // A link definition ([label]: url) is a top-level markdown token ("def").
      editor.commands.setContent("[dust]: https://dust.tt", {
        contentType: "markdown",
      });

      const blocks = rawBlocks(editor);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain("[dust]:");
    });

    it("preserves raw content through getMarkdown round-trip", () => {
      const md = "paragraph\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nafter";
      editor.commands.setContent(md, { contentType: "markdown" });

      const out = editor.getMarkdown();
      expect(out).toContain("| a | b |");
      expect(out).toContain("paragraph");
      expect(out).toContain("after");
    });
  });

  describe("data-raw-markdown HTML round-trip", () => {
    it("re-parses a serialized raw block", () => {
      const rawContent = "| a | b |\n|---|---|\n| 1 | 2 |";
      const html = `<div data-raw-markdown="" data-content="${rawContent}"></div>`;

      editor.commands.setContent(html);

      const blocks = rawBlocks(editor);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe(rawContent);
    });

    it("decodes server-side \\n escapes back to newlines", () => {
      // renderToHTMLString encodes actual newlines as \n (backslash-n) in
      // attribute values. The parser must decode them back.
      const html = `<div data-raw-markdown="" data-content="line1\\nline2\\nline3"></div>`;

      editor.commands.setContent(html);

      const blocks = rawBlocks(editor);
      expect(blocks[0]).toBe("line1\nline2\nline3");
    });

    it("serializes back to a div with data-raw-markdown and data-content", () => {
      const rawContent = "some raw content";
      editor.commands.setContent(
        `<div data-raw-markdown="" data-content="${rawContent}"></div>`
      );

      const outputHtml = editor.getHTML();
      expect(outputHtml).toContain("data-raw-markdown");
      expect(outputHtml).toContain(`data-content="${rawContent}"`);
    });

    it("round-trips raw content containing quotes, angle brackets, ampersands, newlines, and backslashes", () => {
      // These characters would break the data-content attribute if not encoded.
      const table =
        '| "quoted" | <tag> | &amp; | back\\slash |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |';
      editor.commands.setContent(table, { contentType: "markdown" });

      // Confirm the node holds the raw content correctly.
      const blocks = rawBlocks(editor);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain('"quoted"');
      expect(blocks[0]).toContain("<tag>");
      expect(blocks[0]).toContain("&amp;");
      expect(blocks[0]).toContain("back\\slash");

      // Confirm the HTML attribute is properly encoded (no bare " breaking the attr).
      const html = editor.getHTML();
      expect(html).not.toContain('data-content="| "quoted"');
      expect(html).toContain("&quot;");

      // Confirm the round-trip back to markdown preserves the content.
      const md = editor.getMarkdown();
      expect(md).toContain('"quoted"');
      expect(md).toContain("<tag>");
    });
  });
});
