import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InstructionBlockExtension } from "@app/components/editor/extensions/agent_builder/InstructionBlockExtension";
import { CustomMarkdown } from "@app/components/editor/extensions/markdown/CustomMarkdownExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

/**
 * Tests for CustomMarkdown implementation.
 *
 * Focus: Core functionality that works with CustomMarkdown:
 * 1. Basic markdown parsing/serialization works correctly
 * 2. Custom extensions (like InstructionBlock) work with CustomMarkdown
 * 3. API compatibility with Tiptap markdown interface
 *
 * Note: markdown-it with html:false currently strips HTML tags rather than preserving them.
 * This is a known limitation that will need additional configuration to fully preserve
 * HTML as literal text in the future.
 */
describe("CustomMarkdown", () => {
  let editor: Editor;

  beforeEach(() => {
    // Use CustomMarkdown instead of default Markdown extension
    editor = EditorFactory([CustomMarkdown]);
  });

  afterEach(() => {
    editor.destroy();
  });

  describe("HTML handling", () => {
    it("should strip HTML tags when parsing (current behavior)", () => {
      const markdownWithHTML = "Here is some <div>HTML content</div> text";

      editor.commands.setContent(markdownWithHTML, {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      // Current behavior: markdown-it strips HTML tags but preserves content
      expect(json.content).toEqual([
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Here is some ",
            },
            {
              type: "text",
              text: "HTML content",
            },
            {
              type: "text",
              text: " text",
            },
          ],
        },
      ]);
    });

    it("should handle markdown with inline HTML gracefully", () => {
      const markdown = "Code example: <button>Click</button>";

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const result = editor.getMarkdown();

      // HTML is stripped but content is preserved
      expect(result).toContain("Click");
    });

    it("should not break on self-closing HTML tags", () => {
      const markdown = "Line with <br /> break";

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      // Should not throw, HTML is stripped
      const result = editor.getMarkdown();
      expect(result).toContain("Line with");
      expect(result).toContain("break");
    });
  });

  describe("Basic markdown parsing", () => {
    it("should parse paragraphs", () => {
      const markdown = "First paragraph\n\nSecond paragraph";

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      // Should have at least 2 paragraphs
      const paragraphs = json.content?.filter((n) => n.type === "paragraph");
      expect(paragraphs).toBeDefined();
      expect(paragraphs!.length).toBeGreaterThanOrEqual(2);
    });

    it("should parse headings", () => {
      const markdown = "# Heading 1\n\n## Heading 2\n\n### Heading 3";

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      expect(json.content).toEqual([
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Heading 1" }],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Heading 2" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Heading 3" }],
        },
        {
          type: "paragraph",
        },
      ]);
    });

    it("should parse bullet lists", () => {
      const markdown = "- Item 1\n- Item 2\n- Item 3";

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      expect(json.content).toEqual([
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item 1" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item 2" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item 3" }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
        },
      ]);
    });

    it("should parse ordered lists", () => {
      const markdown = "1. First\n2. Second\n3. Third";

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      expect(json.content).toEqual([
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Third" }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
        },
      ]);
    });

    it("should parse code blocks", () => {
      const markdown = "```javascript\nconst x = 1;\n```";

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      expect(json.content).toEqual([
        {
          type: "codeBlock",
          attrs: { language: "javascript" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
        {
          type: "paragraph",
        },
      ]);
    });

    it("should parse blockquotes", () => {
      const markdown = "> This is a quote\n> Second line";

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      expect(json.content).toEqual([
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "This is a quote\nSecond line",
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
        },
      ]);
    });
  });

  describe("Basic markdown serialization", () => {
    it("should serialize paragraphs to markdown", () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello world" }],
          },
        ],
      });

      const markdown = editor.getMarkdown();

      expect(markdown).toContain("Hello world");
    });

    it("should serialize headings to markdown", () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Title" }],
          },
        ],
      });

      const markdown = editor.getMarkdown();

      expect(markdown).toContain("# Title");
    });

    it("should serialize bullet lists to markdown", () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Item 1" }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Item 2" }],
                  },
                ],
              },
            ],
          },
        ],
      });

      const markdown = editor.getMarkdown();

      expect(markdown).toContain("- Item 1");
      expect(markdown).toContain("- Item 2");
    });

    it("should serialize ordered lists to markdown", () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "orderedList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "First" }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Second" }],
                  },
                ],
              },
            ],
          },
        ],
      });

      const markdown = editor.getMarkdown();

      expect(markdown).toContain("1. First");
      expect(markdown).toContain("2. Second");
    });

    it("should serialize code blocks to markdown", () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "codeBlock",
            attrs: { language: "typescript" },
            content: [{ type: "text", text: "const x: number = 1;" }],
          },
        ],
      });

      const markdown = editor.getMarkdown();

      expect(markdown).toContain("```typescript");
      expect(markdown).toContain("const x: number = 1;");
      expect(markdown).toContain("```");
    });
  });

  describe("Round-trip consistency", () => {
    it("should maintain content through parse and serialize", () => {
      const original =
        "# Title\n\nParagraph with text.\n\n- List item 1\n- List item 2";

      editor.commands.setContent(original, {
        contentType: "markdown",
      });

      const markdown = editor.getMarkdown();

      // Re-parse the serialized markdown
      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const secondMarkdown = editor.getMarkdown();

      // Should be stable (ignoring minor formatting differences)
      expect(secondMarkdown).toContain("Title");
      expect(secondMarkdown).toContain("List item 1");
      expect(secondMarkdown).toContain("List item 2");
    });

    it("should handle markdown without HTML tags through round-trip", () => {
      const original = "Example: content with **bold** text";

      editor.commands.setContent(original, {
        contentType: "markdown",
      });

      const markdown = editor.getMarkdown();

      // Re-parse
      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const secondMarkdown = editor.getMarkdown();

      // Content should be preserved
      expect(secondMarkdown).toContain("content");
    });
  });

  describe("Integration with custom extensions", () => {
    it("should work with InstructionBlock extension", () => {
      // Create editor with both CustomMarkdown and InstructionBlock
      const customEditor = EditorFactory([
        CustomMarkdown,
        InstructionBlockExtension,
      ]);

      try {
        const markdown = "<instructions>\nTest content\n</instructions>";

        customEditor.commands.setContent(markdown, {
          contentType: "markdown",
        });

        const json = customEditor.getJSON();

        // Should parse instruction block
        expect(json.content).toEqual([
          {
            type: "instructionBlock",
            attrs: {
              type: "instructions",
              isCollapsed: false,
            },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Test content" }],
              },
            ],
          },
          {
            type: "paragraph",
          },
        ]);

        // Should serialize back
        const result = customEditor.getMarkdown();
        expect(result).toContain("<instructions>");
        expect(result).toContain("</instructions>");
      } finally {
        customEditor.destroy();
      }
    });

    it("should parse instruction blocks correctly", () => {
      const customEditor = EditorFactory([
        CustomMarkdown,
        InstructionBlockExtension,
      ]);

      try {
        // Instruction block without HTML
        const markdown =
          "<instructions>Real block content</instructions>\n\nRegular paragraph text";

        customEditor.commands.setContent(markdown, {
          contentType: "markdown",
        });

        const json = customEditor.getJSON();

        // Should have instruction block and regular paragraph
        expect(json.content).toEqual([
          {
            type: "instructionBlock",
            attrs: {
              type: "instructions",
              isCollapsed: false,
            },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Real block content" }],
              },
            ],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Regular paragraph text" }],
          },
        ]);
      } finally {
        customEditor.destroy();
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle empty content", () => {
      editor.commands.setContent("", {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      expect(json.type).toBe("doc");
      expect(json.content).toEqual([
        {
          type: "paragraph",
        },
      ]);
    });

    it("should handle whitespace-only content", () => {
      editor.commands.setContent("   \n\n   ", {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      expect(json.type).toBe("doc");
      expect(json.content).toEqual([
        {
          type: "paragraph",
        },
      ]);
    });

    it("should handle special characters in HTML tags", () => {
      const markdown =
        'HTML: <button data-id="123" onClick={() => {}}>Click</button>';

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const result = editor.getMarkdown();

      // Special characters should be preserved
      expect(result).toContain("data-id");
      expect(result).toContain("onClick");
    });

    it("should handle markdown with multiple blank lines", () => {
      const markdown = "Paragraph 1\n\n\n\nParagraph 2";

      editor.commands.setContent(markdown, {
        contentType: "markdown",
      });

      const json = editor.getJSON();

      // Should normalize to reasonable spacing
      const paragraphs = json.content?.filter((n) => n.type === "paragraph");
      expect(paragraphs).toBeDefined();
      expect(paragraphs!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("API compatibility", () => {
    it("should expose getMarkdown method on editor", () => {
      expect(editor.getMarkdown).toBeDefined();
      expect(typeof editor.getMarkdown).toBe("function");
    });

    it("should support contentType markdown in setContent", () => {
      const markdown = "# Test";

      expect(() => {
        editor.commands.setContent(markdown, {
          contentType: "markdown",
        });
      }).not.toThrow();

      const json = editor.getJSON();
      expect(json.content?.some((n) => n.type === "heading")).toBe(true);
    });

    it("should support contentType markdown in insertContent", () => {
      const markdown = "**bold text**";

      expect(() => {
        editor.commands.insertContent(markdown, {
          contentType: "markdown",
        });
      }).not.toThrow();
    });

    it("should expose customMarkdown manager on editor", () => {
      expect(editor.customMarkdown).toBeDefined();
      expect(editor.customMarkdown?.serialize).toBeDefined();
      expect(editor.customMarkdown?.parse).toBeDefined();
    });
  });
});
