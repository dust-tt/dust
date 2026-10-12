import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function renderEditor(
  initialContent = "# Title\n",
  { onRender = (): void => undefined } = {}
) {
  return renderHook(
    (props: { initialContent: string }) => {
      onRender();
      return useDocumentEditor({
        initialContent: props.initialContent,
        readOnly: false,
        resolveImageSource: () => null,
      });
    },
    { initialProps: { initialContent } }
  );
}

async function mountedEditor(result: { current: { editor: Editor | null } }) {
  await waitFor(() => expect(result.current.editor).not.toBeNull());
  await act(nextTick);
  const editor = result.current.editor;
  if (!editor) {
    throw new Error("Editor did not mount.");
  }
  return editor;
}

describe("useDocumentEditor", () => {
  it("shows the file read-only without a live session", async () => {
    const { result } = renderEditor();
    const editor = await mountedEditor(result);

    expect(result.current.editable).toBe(false);
    expect(editor.isEditable).toBe(false);
    expect(editor.getText().trim()).toBe("Title");
  });

  it("keeps the refused source and reason when the content prop changes", () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    const { result, rerender } = renderEditor(table);
    const refused = result.current.unsupported;
    expect(refused?.source).toBe(table);

    rerender({ initialContent: "# Plain\n" });

    expect(result.current.unsupported).toEqual(refused);
  });

  it("does not re-render on edits, and never reapplies the editor's options", async () => {
    let renders = 0;
    const { result, rerender } = renderEditor(undefined, {
      onRender: () => renders++,
    });
    const editor = await mountedEditor(result);
    const setOptions = vi.spyOn(editor, "setOptions");
    renders = 0;

    for (const text of ["a", "b", "c", "d"]) {
      act(() => {
        editor.commands.insertContent(text);
      });
    }
    expect(renders).toBe(0);

    rerender({ initialContent: "# Title\n" });
    await act(nextTick);
    expect(setOptions).not.toHaveBeenCalled();
  });
});
