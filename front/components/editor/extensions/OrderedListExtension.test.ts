import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("OrderedListExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should preserve start attribute when serializing to markdown", () => {
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 2 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second item" }],
                },
              ],
            },
          ],
        },
      ],
    });

    const markdown = editor.getMarkdown();
    expect(markdown).toEqual(`2. Second item

<br>`);
  });

  it("should handle multiple items with custom start", () => {
    editor.commands.setContent({
      type: "orderedList",
      attrs: { start: 5 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Fifth" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Sixth" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Seventh" }],
            },
          ],
        },
      ],
    });

    const markdown = editor.getMarkdown();
    expect(markdown).toEqual(`5. Fifth
6. Sixth
7. Seventh

<br>`);
  });

  it("should default to 1 when start attribute is not provided", () => {
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
          ],
        },
      ],
    });

    const markdown = editor.getMarkdown();
    expect(markdown).toEqual(`1. First

<br>`);
  });

  it("should not affect bullet lists", () => {
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
                  content: [{ type: "text", text: "Bullet item" }],
                },
              ],
            },
          ],
        },
      ],
    });

    const markdown = editor.getMarkdown();
    expect(markdown).toEqual(`- Bullet item

<br>`);
  });
});
