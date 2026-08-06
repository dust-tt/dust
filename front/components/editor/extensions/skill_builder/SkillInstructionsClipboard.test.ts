import { KnowledgeNodeWithView } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeWithView";
import { ToolNodeWithView } from "@app/components/editor/extensions/skill_builder/ToolNodeWithView";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import { SkillInstructionsEditorContent } from "@app/components/editor/SkillInstructionsEditor";
import { act, fireEvent, render } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("skill instructions clipboard", () => {
  let sourceEditor: Editor;
  let unmountSourceEditor: () => void;

  beforeEach(() => {
    sourceEditor = EditorFactory([
      KnowledgeNodeWithView.configure({ readOnly: true }),
      ToolNodeWithView,
    ]);
    act(() => {
      const { unmount } = render(
        createElement(SkillInstructionsEditorContent, {
          editor: sourceEditor,
          isReadOnly: true,
        })
      );
      unmountSourceEditor = unmount;
    });
  });

  afterEach(() => {
    act(() => {
      sourceEditor.destroy();
      unmountSourceEditor();
    });
  });

  it("copies canonical knowledge and tool nodes", async () => {
    await act(async () => {
      sourceEditor.commands.setContent(
        '<p>Use <knowledge id="knowledge_1" title="Handbook" space="space_1" dsv="dsv_1" hasChildren="false"></knowledge> and <tool id="tool_1" name="Search" icon="SearchIcon"></tool>.</p>'
      );
    });

    const range = document.createRange();
    range.selectNodeContents(sourceEditor.view.dom);
    const selection = window.getSelection();
    if (!selection) {
      throw new Error("Expected a DOM selection.");
    }
    vi.spyOn(selection, "getRangeAt").mockReturnValue(range);
    vi.spyOn(selection, "isCollapsed", "get").mockReturnValue(false);
    vi.spyOn(selection, "rangeCount", "get").mockReturnValue(1);

    const clipboard = new Map<string, string>();
    fireEvent.copy(sourceEditor.view.dom, {
      clipboardData: {
        clearData: () => clipboard.clear(),
        setData: (type: string, value: string) => clipboard.set(type, value),
      },
    });

    const html = clipboard.get("text/html");
    expect(html).toContain("<knowledge");
    expect(html).toContain("<tool");
  });
});
