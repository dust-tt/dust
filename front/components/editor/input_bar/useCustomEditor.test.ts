import {
  InputBarSlashSuggestionExtension,
  inputBarSlashSuggestionPluginKey,
} from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionExtension";
import useCustomEditor, {
  buildEditorExtensions,
} from "@app/components/editor/input_bar/useCustomEditor";
import type { WorkspaceType } from "@app/types/user";
import { act, renderHook } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
  regionalModelsOnly: false,
} satisfies WorkspaceType;

describe("buildEditorExtensions", () => {
  let editor: Editor;

  function createSlashSuggestionEditor() {
    return new Editor({
      extensions: [
        StarterKit,
        InputBarSlashSuggestionExtension.configure({
          attachedNodesRef: { current: [] },
          owner,
          enabledRef: { current: true },
          onModelSelectRef: { current: undefined },
          onNodeSelectRef: { current: undefined },
          onSelectRef: { current: undefined },
          selectedMCPServerViewIdsRef: { current: new Set<string>() },
          slashCommandsRef: { current: [] },
          includeAttachKnowledgeRef: { current: false },
          includePickModelRef: { current: false },
          spaceIdRef: { current: null },
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

describe("useCustomEditor placeholder override", () => {
  beforeAll(() => {
    // jsdom does not implement matchMedia (used by useIsMobile).
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderEditorHook() {
    const initialProps: { placeholderOverride: string | null } = {
      placeholderOverride: null,
    };
    const { result, rerender } = renderHook(
      ({ placeholderOverride }: { placeholderOverride: string | null }) =>
        useCustomEditor({
          onEnterKeyDown: vi.fn(),
          disableAutoFocus: true,
          owner,
          conversationId: "cId",
          placeholderOverride,
        }),
      { initialProps }
    );

    const editor = result.current.editor;
    if (!editor) {
      throw new Error("Editor was not initialized");
    }

    return { editor, result, rerender };
  }

  function getPlaceholderText(editor: Editor) {
    return editor.view.dom.querySelector("p")?.getAttribute("data-placeholder");
  }

  it("types the new placeholder without recreating the editor", () => {
    const { editor, result, rerender } = renderEditorHook();

    expect(getPlaceholderText(editor)).toBe("Get work done");

    rerender({ placeholderOverride: "Add a follow-up..." });

    // Typing starts from the first character.
    expect(result.current.editor).toBe(editor);
    expect(getPlaceholderText(editor)).toBe("A");

    act(() => {
      vi.runAllTimers();
    });

    expect(getPlaceholderText(editor)).toBe("Add a follow-up...");

    rerender({ placeholderOverride: null });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.editor).toBe(editor);
    expect(getPlaceholderText(editor)).toBe("Get work done");
  });

  it("preserves content and selection across placeholder changes", () => {
    const { editor, result, rerender } = renderEditorHook();

    act(() => {
      editor.commands.setContent("hello");
      editor.commands.setTextSelection(3);
    });

    rerender({ placeholderOverride: "Add a follow-up..." });

    expect(result.current.editor).toBe(editor);
    expect(editor.getText()).toBe("hello");
    expect(editor.state.selection.from).toBe(3);
  });
});
