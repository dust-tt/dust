import { InstructionBlockExtension } from "@app/components/editor/extensions/agent_builder/InstructionBlockExtension";
import { InstructionsDocumentExtension } from "@app/components/editor/extensions/agent_builder/InstructionsDocumentExtension";
import { InstructionsRootExtension } from "@app/components/editor/extensions/agent_builder/InstructionsRootExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import type { Editor } from "@tiptap/core";
import type { Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
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

describe("InstructionBlockExtension transformCopied", () => {
  let editor: Editor;

  // Helper: creates an editor with the instructionsRoot wrapper (like the
  // real agent-builder editor) so that the document structure is:
  // doc > instructionsRoot > block+
  const createInstructionsEditor = () =>
    EditorFactory(
      [
        InstructionsDocumentExtension,
        InstructionsRootExtension,
        InstructionBlockExtension,
      ],
      { starterKit: { document: false } }
    );

  afterEach(() => {
    editor?.destroy();
  });

  /**
   * Extract the transformCopied prop from the instructionBlockCopyContext
   * plugin registered by InstructionBlockExtension.
   */
  function getTransformCopied(ed: Editor) {
    const plugins = ed.state.plugins;
    const plugin = plugins.find((p) =>
      (p as any).key?.includes("instructionBlockCopyContext")
    );
    expect(plugin).toBeDefined();
    return (plugin as any).props.transformCopied as (slice: Slice) => Slice;
  }

  it("should strip instructionBlock/instructionsRoot context when copying inner text", () => {
    editor = createInstructionsEditor();
    editor.commands.setContent("<example>test</example>", {
      contentType: "markdown",
    });

    // Select the text "test" inside the instruction block.
    // doc structure: doc > instructionsRoot > instructionBlock > paragraph("test")
    // We need to find the text position inside the paragraph.
    const doc = editor.state.doc;
    let textFrom = -1;
    let textTo = -1;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === "test") {
        textFrom = pos;
        textTo = pos + node.nodeSize;
      }
    });
    expect(textFrom).toBeGreaterThan(0);

    // Create a text selection and get the slice (simulates what ProseMirror
    // does on Cmd+C).
    const selection = TextSelection.create(doc, textFrom, textTo);
    const slice = selection.content();

    // Before transformCopied: the slice should contain instructionsRoot and
    // instructionBlock wrappers in its open context.
    expect(slice.openStart).toBeGreaterThanOrEqual(2);

    // Apply transformCopied.
    const transformCopied = getTransformCopied(editor);
    const result = transformCopied(slice);

    // After: instructionsRoot and instructionBlock should be stripped.
    // The result should just be paragraph-level content.
    expect(result.openStart).toBeLessThan(slice.openStart);

    // Verify no instructionBlock or instructionsRoot in the result's content tree.
    let hasBlockWrapper = false;
    result.content.descendants((node) => {
      if (
        node.type.name === "instructionBlock" ||
        node.type.name === "instructionsRoot"
      ) {
        hasBlockWrapper = true;
      }
    });
    expect(hasBlockWrapper).toBe(false);
  });

  it("should preserve full block when copying the whole instruction block", () => {
    editor = createInstructionsEditor();
    editor.commands.setContent("before\n\n<example>test</example>\n\nafter", {
      contentType: "markdown",
    });

    // Select everything — this includes the instruction block and surrounding
    // paragraphs, so the instructionsRoot will have multiple children.
    editor.commands.selectAll();
    const slice = editor.state.selection.content();

    const transformCopied = getTransformCopied(editor);
    const result = transformCopied(slice);

    // The slice should be unchanged — the full block structure is preserved.
    expect(result).toBe(slice);
  });

  it("should not modify slices that don't contain instruction blocks", () => {
    editor = createInstructionsEditor();
    editor.commands.setContent("just plain text", {
      contentType: "markdown",
    });

    editor.commands.selectAll();
    const slice = editor.state.selection.content();

    const transformCopied = getTransformCopied(editor);
    const result = transformCopied(slice);

    // No instruction block in the content — slice should be unchanged.
    expect(result).toBe(slice);
  });
});
