import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InstructionBlockExtension } from "@app/components/editor/extensions/agent_builder/InstructionBlockExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("InstructionBlockExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([InstructionBlockExtension]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should serialize basic instruction block to markdown", () => {
    editor.commands.setContent("<instructions>hello</instructions>", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        attrs: {
          isCollapsed: false,
          type: "instructions",
        },
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
        type: "instructionBlock",
      },
      {
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("<instructions>hello</instructions>\n\n");
  });

  it("should serialize instruction block with headings to markdown", () => {
    editor.commands.setContent("<instructions># header1</instructions>", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        attrs: {
          isCollapsed: false,
          type: "instructions",
        },
        content: [
          {
            attrs: {
              level: 1,
            },
            content: [
              {
                text: "header1",
                type: "text",
              },
            ],
            type: "heading",
          },
        ],
        type: "instructionBlock",
      },
      {
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("<instructions># header1</instructions>\n\n");
  });

  it("should serialize instruction block with code blocks to markdown", () => {
    editor.commands.setContent(
      `
<instructions>
\`\`\`
code block
\`\`\`
</instructions>
`,
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        attrs: {
          isCollapsed: false,
          type: "instructions",
        },
        content: [
          {
            attrs: {
              language: null,
            },
            content: [
              {
                text: "code block",
                type: "text",
              },
            ],
            type: "codeBlock",
          },
        ],
        type: "instructionBlock",
      },
      {
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(
      "<instructions>```\n" + "code block\n" + "```</instructions>\n" + "\n"
    );
  });

  it("should create instruction block with custom tag using command", () => {
    editor.commands.insertInstructionBlock("custom-tag");

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        attrs: {
          isCollapsed: false,
          type: "custom-tag",
        },
        content: [
          {
            content: [
              {
                text: "<custom-tag>",
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
                text: "</custom-tag>",
                type: "text",
              },
            ],
            type: "paragraph",
          },
        ],
        type: "instructionBlock",
      },
      {
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(
      "<custom-tag><custom-tag></custom-tag></custom-tag>\n\n"
    );
  });
});
