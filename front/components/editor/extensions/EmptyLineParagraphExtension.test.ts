import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("EmptyLineParagraphExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    // extension already in EditorFactory
    editor = EditorFactory([]);
  });

  afterEach(() => {
    editor.destroy();
  });

  describe("basic functionality", () => {
    it("should preserve single empty line (normal paragraph break)", () => {
      const input = "Line 1\n\nLine 2";
      editor.commands.setContent(input, { contentType: "markdown" });

      const output = editor.getMarkdown();
      expect(output).toBe(`Line 1

Line 2`);
    });

    it("should preserve multiple empty lines", () => {
      const input = "Line 1\n\n\nLine 2";
      editor.commands.setContent(input, { contentType: "markdown" });

      const output = editor.getMarkdown();
      expect(output).toBe(`Line 1

Line 2`);
    });

    it("should handle the GitHub issue example", () => {
      const input = "Tutu\n\n\n\n\nTata\n\n\n\n\nToto";
      editor.commands.setContent(input, { contentType: "markdown" });

      const output = editor.getMarkdown();
      expect(output).toBe("Tutu\n\nTata\n\nToto");
    });
  });

  describe("round-trip conversion", () => {
    it("should preserve content through markdown round-trip", () => {
      const original = "Start\n\n\n\nMiddle\n\n\n\nEnd";
      editor.commands.setContent(original, { contentType: "markdown" });

      const markdown = editor.getMarkdown();

      // Create new editor and load the markdown
      const editor2 = EditorFactory([]);

      editor2.commands.setContent(markdown, { contentType: "markdown" });
      const output = editor2.getMarkdown();

      // The content should be preserved (with possible <br> tags)
      expect(output).toBe(`Start

Middle

End`);

      editor2.destroy();
    });
  });

  describe("<br> tag handling", () => {
    it("should parse <br> tags as empty paragraphs", () => {
      const input = "Line 1\n\n<br>\n\nLine 2";
      editor.commands.setContent(input, { contentType: "markdown" });

      const json = editor.getJSON();

      // Should have 3 paragraphs: "Line 1", empty, "Line 2"
      expect(json).toStrictEqual({
        content: [
          {
            content: [
              {
                text: "Line 1",
                type: "text",
              },
            ],
            type: "paragraph",
          },
          {
            type: "paragraph",
          },
          {
            content: [
              {
                text: "Line 2",
                type: "text",
              },
            ],
            type: "paragraph",
          },
        ],
        type: "doc",
      });
    });
  });

  describe("edge cases", () => {
    it("should handle text starting with empty lines", () => {
      const input = "\n\n\nText";
      editor.commands.setContent(input, { contentType: "markdown" });

      const output = editor.getMarkdown();
      expect(output).toBe("Text");
    });

    it("should handle text ending with empty lines", () => {
      const input = "Text\n\n\n";
      editor.commands.setContent(input, { contentType: "markdown" });

      const output = editor.getMarkdown();
      expect(output).toBe("Text");
    });

    it("should handle only empty lines", () => {
      const input = "\n\n\n\n\n";
      editor.commands.setContent(input, { contentType: "markdown" });

      const json = editor.getJSON();
      // Should have multiple empty paragraphs
      expect(json.content).toStrictEqual([
        {
          type: "paragraph",
        },
      ]);
    });

    it("should not affect normal paragraphs with content", () => {
      const input = "Normal paragraph\n\nAnother paragraph\n\nThird paragraph";
      editor.commands.setContent(input, { contentType: "markdown" });

      const output = editor.getMarkdown();
      expect(output).toBe(`Normal paragraph

Another paragraph

Third paragraph`);
    });
  });
});
