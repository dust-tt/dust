import { InstructionBlockExtension } from "@app/components/editor/extensions/agent_builder/InstructionBlockExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

&nbsp;`);
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

&nbsp;`);
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
        "&nbsp;"
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

&nbsp;

</instructions>

&nbsp;`);
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

&nbsp;`);
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
    expect(result).toBe(`<instructions_toto>

&nbsp;

</instructions_toto>

&nbsp;`);
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

&nbsp;`);
  });

  it("should not throw on tags with only whitespace content", () => {
    expect(() => {
      editor.commands.setContent("<foo>\n</foo>\n\nHello", {
        contentType: "markdown",
      });
    }).not.toThrow();

    const text = editor.getText();
    expect(text).toContain("Hello");
  });

  it("should work on deep-nested instruction blocks with NBSP", () => {
    editor.commands.setContent(
      // Contains NBSP before the `1. something`
      // eslint-disable-next-line no-irregular-whitespace
      `<prompt>\n<instructions>\n<do>\n    1. something\n</do>\n</instructions>\n</prompt>`,
      {
        contentType: "markdown",
      }
    );

    // check it doesn't fail
    void editor.getJSON();

    const markdown = editor.getMarkdown();
    // We loose the <do> but at least the content can be displayed
    expect(markdown).toEqual(`<prompt>

<instructions>

<do>

1. something

</do>

</instructions>

</prompt>

&nbsp;`);
  });
});
