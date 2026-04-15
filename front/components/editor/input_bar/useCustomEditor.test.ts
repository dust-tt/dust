import { inputBarSkillSuggestionPluginKey } from "@app/components/editor/extensions/input_bar/InputBarSkillSuggestionExtension";
import useCustomEditor, {
  buildEditorExtensions,
} from "@app/components/editor/input_bar/useCustomEditor";
import type { WorkspaceType } from "@app/types/user";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = {
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

describe("buildEditorExtensions", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: buildEditorExtensions({
        owner: OWNER,
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
});

describe("useCustomEditor", () => {
  it("opens the skill picker instead of submitting when Enter is pressed on a slash trigger", async () => {
    const onEnterKeyDown = vi.fn();
    const onOpenSkillPicker = vi.fn();

    const { result, unmount } = renderHook(() =>
      useCustomEditor({
        onEnterKeyDown,
        disableAutoFocus: true,
        owner: OWNER,
        onOpenSkillPicker,
      })
    );

    await waitFor(() =>
      expect(result.current.editor?.view.props.handleKeyDown).toBeDefined()
    );

    const editor = result.current.editor;
    expect(editor).not.toBeNull();

    act(() => {
      editor?.commands.setContent("/git", { contentType: "markdown" });
      editor?.commands.focus("end");
    });

    vi.spyOn(editor!.view, "coordsAtPos").mockReturnValue({
      left: 12,
      right: 12,
      top: 34,
      bottom: 50,
    });

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });

    let handled = false;
    act(() => {
      handled = editor?.view.props.handleKeyDown?.(editor.view, event) ?? false;
    });

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(onEnterKeyDown).not.toHaveBeenCalled();
    expect(onOpenSkillPicker).toHaveBeenCalledTimes(1);
    expect(onOpenSkillPicker.mock.calls[0]?.[1]).toBe("git");

    unmount();
  });

  it("lets the active slash suggestion handle Enter", async () => {
    const onEnterKeyDown = vi.fn();
    const onOpenSkillPicker = vi.fn();

    const { result, unmount } = renderHook(() =>
      useCustomEditor({
        onEnterKeyDown,
        disableAutoFocus: true,
        owner: OWNER,
        onOpenSkillPicker,
      })
    );

    await waitFor(() =>
      expect(result.current.editor?.view.props.handleKeyDown).toBeDefined()
    );

    const editor = result.current.editor;
    expect(editor).not.toBeNull();

    act(() => {
      editor?.commands.setContent("/git", { contentType: "markdown" });
      editor?.commands.focus("end");
    });

    const slashSuggestionStateSpy = vi
      .spyOn(inputBarSkillSuggestionPluginKey, "getState")
      .mockReturnValue({ active: true } as never);

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });

    let handled = false;
    act(() => {
      handled = editor?.view.props.handleKeyDown?.(editor.view, event) ?? false;
    });

    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(onEnterKeyDown).not.toHaveBeenCalled();
    expect(onOpenSkillPicker).not.toHaveBeenCalled();

    slashSuggestionStateSpy.mockRestore();
    unmount();
  });

  it("lets the open skill picker handle arrow navigation", async () => {
    const onEnterKeyDown = vi.fn();
    const onSkillPickerKeyDown = vi.fn(() => true);

    const { result, unmount } = renderHook(() =>
      useCustomEditor({
        onEnterKeyDown,
        disableAutoFocus: true,
        owner: OWNER,
        onSkillPickerKeyDown,
      })
    );

    await waitFor(() =>
      expect(result.current.editor?.view.props.handleKeyDown).toBeDefined()
    );

    const editor = result.current.editor;
    expect(editor).not.toBeNull();

    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      cancelable: true,
    });

    let handled = false;
    act(() => {
      handled = editor?.view.props.handleKeyDown?.(editor.view, event) ?? false;
    });

    expect(handled).toBe(true);
    expect(onSkillPickerKeyDown).toHaveBeenCalledTimes(1);
    expect(onSkillPickerKeyDown).toHaveBeenCalledWith(event);
    expect(onEnterKeyDown).not.toHaveBeenCalled();

    unmount();
  });
});
