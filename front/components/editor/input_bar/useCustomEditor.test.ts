import {
  InputBarSlashSuggestionExtension,
  inputBarSlashSuggestionPluginKey,
} from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionExtension";
import { buildEditorExtensions } from "@app/components/editor/input_bar/useCustomEditor";
import type { WorkspaceType } from "@app/types/user";
import { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("buildEditorExtensions", () => {
  let editor: Editor;
  const owner = {
    id: 0,
    sId: "wId",
    name: "MeMeMe AlwaysMe",
    role: "user",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    metadata: null,
    metronomeCustomerId: null,
    sharingPolicy: "all_scopes",
  } satisfies WorkspaceType;

  function createSlashSuggestionEditor() {
    return new Editor({
      extensions: [
        StarterKit,
        InputBarSlashSuggestionExtension.configure({
          owner,
          enabledRef: { current: true },
          onSelectRef: { current: undefined },
          selectedMCPServerViewIdsRef: { current: new Set<string>() },
        }),
      ],
    });
  }

  beforeEach(() => {
    editor = new Editor({
      extensions: buildEditorExtensions({
        owner,
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
        "&nbsp;"
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

  it("should not create inline code from backslash-escaped backticks", () => {
    const sql = "FROM \\`env_dmo_a\\`.\\`dwh_repository\\`.\\`company\\`;";
    editor.commands.setContent(sql, { contentType: "markdown" });

    const json = editor.getJSON();
    // All text should be plain text nodes — no code marks.
    const hasCodeMark = JSON.stringify(json).includes('"type":"code"');
    expect(hasCodeMark).toBe(false);
  });

  it("should treat escaped backticks as content inside a code span", () => {
    // Wrapping SQL with escaped backticks in a code span:
    // `FROM \`env_dmo_a\`.\`company\`;`
    const input = "`FROM \\`env_dmo_a\\`.\\`dwh_repository\\`.\\`company\\`;`";
    editor.commands.setContent(input, { contentType: "markdown" });

    const json = editor.getJSON();
    // The entire content should be a single code mark.
    const hasCodeMark = JSON.stringify(json).includes('"type":"code"');
    expect(hasCodeMark).toBe(true);
  });

  it("should still create inline code from normal backticks", () => {
    editor.commands.setContent("hello `world` end", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    const hasCodeMark = JSON.stringify(json).includes('"type":"code"');
    expect(hasCodeMark).toBe(true);
  });

  it("round-trips inline skill tags as skill nodes", () => {
    editor.commands.setContent(
      '<skill id="skill_123" name="commit" icon="book_open" />',
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain('"type":"skill"');
    expect(JSON.stringify(json)).toContain('"skillId":"skill_123"');
    expect(JSON.stringify(json)).toContain('"skillName":"commit"');
    expect(JSON.stringify(json)).toContain('"skillIcon":"book_open"');
    expect(editor.getMarkdown()).toContain(
      '<skill id="skill_123" name="commit" icon="book_open" />'
    );
  });

  it("round-trips inline skill tags without an icon", () => {
    editor.commands.setContent('<skill id="skill_123" name="commit" />', {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain('"type":"skill"');
    expect(JSON.stringify(json)).toContain('"skillId":"skill_123"');
    expect(JSON.stringify(json)).toContain('"skillName":"commit"');
    expect(editor.getMarkdown()).toContain(
      '<skill id="skill_123" name="commit" />'
    );
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

&nbsp;`);
  });

  it("does not open slash suggestions for pasted slashes", () => {
    editor.destroy();
    editor = createSlashSuggestionEditor();
    editor.commands.focus();

    editor.view.dispatch(
      editor.state.tr
        .insertText("/help", 1)
        .setMeta("paste", true)
        .setMeta("uiEvent", "paste")
    );

    expect(
      inputBarSlashSuggestionPluginKey.getState(editor.state)?.active
    ).toBe(false);
  });
});
