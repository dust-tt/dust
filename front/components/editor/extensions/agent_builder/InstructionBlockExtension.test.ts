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
    expect(result).toBe(`<instructions>

hello

</instructions>

<br>`);
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
    expect(result).toBe(`<instructions>

# header1

</instructions>

<br>`);
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
      "<instructions>\n" +
        "\n" +
        "```\n" +
        "code block\n" +
        "```\n" +
        "\n" +
        "</instructions>\n" +
        "\n" +
        "<br>"
    );
  });

  it("should create instruction block using command", () => {
    editor.commands.insertInstructionBlock();

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        attrs: {
          isCollapsed: false,
          type: "instructions",
        },
        content: [
          {
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
    expect(result).toBe(`<instructions>

<br>

</instructions>

<br>`);
  });

  it("should serialize instruction block with mentions", () => {
    editor.commands.setContent(
      `
<instructions>
:mention[agent-name]{sId=agent-123}
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
            content: [
              {
                text: ":mention[agent-name]{sId=agent-123}",
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
    expect(result).toBe(`<instructions>

:mention[agent-name]{sId=agent-123}

</instructions>

<br>`);
  });

  it("should serialize instruction block with _", () => {
    editor.commands.setContent(`<instructions_toto></instructions_toto>`, {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        attrs: {
          isCollapsed: false,
          type: "instructions_toto",
        },
        type: "instructionBlock",
      },
      {
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(`<instructions_toto>



</instructions_toto>

<br>`);
  });

  it("should serialize instruction block to markdown with paragraph then list", () => {
    editor.commands.setContent(
      `<instructions>
Toto:
* hello
* darkness
* my old friend
</instructions>`,
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
            content: [
              {
                text: "Toto:",
                type: "text",
              },
            ],
            type: "paragraph",
          },
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
                        text: "darkness",
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
                        text: "my old friend",
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
        ],
        type: "instructionBlock",
      },
      {
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(`<instructions>

Toto:

- hello
- darkness
- my old friend

</instructions>

<br>`);
  });

  it("should serialize instruction with HTML to markdown", () => {
    editor.commands.setContent(
      `
<instructions>

<a href="https://www.google.com">Google</a>
<span style="color: red"></span>
<div/>

</instructions>`,
      {
        contentType: "markdown",
      }
    );

    const result = editor.getMarkdown();
    // Note: HTML is reconstructed from DOM, so formatting may change slightly
    // (e.g., <div/> becomes <div></div>), but semantic content is preserved
    expect(result).toBe(`<instructions>

<a href="https://www.google.com">Google</a>
<span style="color: red"></span>

<div>

</div>

</instructions>

<br>`);
  });
});
