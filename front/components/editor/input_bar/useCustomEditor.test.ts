import { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildEditorExtensions } from "@app/components/editor/input_bar/useCustomEditor";
import type { WorkspaceType } from "@app/types";

describe("buildEditorExtensions", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: buildEditorExtensions({
        owner: {
          id: 0,
          sId: "wId",
          name: "MeMeMe AlwaysMe",
          role: "user",
          segmentation: null,
          whiteListedProviders: null,
          defaultEmbeddingProvider: null,
          metadata: null,
        } satisfies WorkspaceType,
        conversationId: "cId",
        onInlineText: () => {},
        onUrlDetected: () => {},
      }),
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should handle codeblocks", () => {
    editor.commands.setContent(
      "```javascript\nconsole.log('Hello, world!');\n```",
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        attrs: {
          language: "javascript",
        },
        content: [
          {
            text: "console.log('Hello, world!');",
            type: "text",
          },
        ],
        type: "codeBlock",
      },
      {
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(
      "```javascript\n" +
        "console.log('Hello, world!');\n" +
        "```\n" +
        "\n" +
        "<br>"
    );
  });

  it("should handle horizontalRule", () => {
    editor.commands.setContent("hello\n\n---\n\nworld", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            text: "hello",
            type: "text",
          },
        ],
        type: "paragraph",
      },
      {
        type: "horizontalRule",
      },
      {
        content: [
          {
            text: "world",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("hello\n\n---\n\nworld");
  });

  it("should handle bullet list with `*`", () => {
    editor.commands.setContent("* hello\n* world", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            content: [
              {
                content: [
                  {
                    text: "hello",
                    type: "text",
                  },
                ],
                type: "paragraph",
              },
            ],
            type: "listItem",
          },
          {
            content: [
              {
                content: [
                  {
                    text: "world",
                    type: "text",
                  },
                ],
                type: "paragraph",
              },
            ],
            type: "listItem",
          },
        ],
        type: "bulletList",
      },
      {
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(`- hello
- world

<br>`);
  });
});
