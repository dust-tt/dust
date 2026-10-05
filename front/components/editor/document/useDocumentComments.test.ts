import { getDocumentComments } from "@app/components/editor/document/DocumentComments";
import { useDocumentComments } from "@app/components/editor/document/useDocumentComments";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { Ok } from "@app/types/shared/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Slice } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";

const AT = "2026-09-25T14:16:32.380Z";
const SOURCE = `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`;

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function renderCommentedEditor(initialContent: string) {
  const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
  const rendered = renderHook(() => {
    const document = useDocumentEditor({
      initialContent,
      readOnly: false,
      autosaveDebounceMs: 60_000,
      onSave,
      onStateChange: undefined,
    });
    const comments = useDocumentComments({ editor: document.editor });
    return { document, comments };
  });
  await waitFor(() =>
    expect(rendered.result.current.document.editor).not.toBeNull()
  );
  await act(nextTick);
  return { ...rendered, onSave };
}

describe("useDocumentComments", () => {
  it("shows the file's threads with the text they cover", async () => {
    const { result } = await renderCommentedEditor(SOURCE);

    expect(result.current.comments.comments.map((c) => c.id)).toEqual(["c1"]);
    expect(result.current.comments.unresolved).toHaveLength(1);
    expect(result.current.comments.quotes.get("c1")).toBe("there");
  });

  it("saves edited text with the comment's anchors and thread unchanged", async () => {
    const { result, onSave } = await renderCommentedEditor(SOURCE);

    act(() => {
      result.current.document.editor?.commands.insertContentAt(1, "Well, ");
    });
    await act(() => result.current.document.save());

    expect(onSave.mock.calls[0][0]).toBe(`Well, ${SOURCE}`);
  });

  it("does not carry comment marks in pasted HTML", async () => {
    const { result, onSave } = await renderCommentedEditor(SOURCE);

    act(() => {
      result.current.document.editor?.commands.insertContent(
        '<p><span data-comment-id="c1">copied</span></p>'
      );
    });
    await act(() => result.current.document.save());

    expect(onSave.mock.calls[0][0]).toContain(
      "Hi :comment-start{id=c1}there:comment-end{id=c1}"
    );
    expect(result.current.comments.quotes.get("c1")).toBe("there");
  });

  it("saves formatting applied across a comment's edge", async () => {
    const { result, onSave } = await renderCommentedEditor(
      `Hi :comment-start{id=c1}there:comment-end{id=c1} friend\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`
    );

    act(() => {
      result.current.document.editor
        ?.chain()
        .setTextSelection({ from: 1, to: 16 })
        .toggleItalic()
        .run();
    });
    await act(() => result.current.document.save());

    expect(result.current.document.error).toBeNull();
    expect(onSave.mock.calls[0][0]).toContain(
      "*Hi :comment-start{id=c1}there:comment-end{id=c1} friend*"
    );
  });

  it("reuses the parsed threads across cursor moves", async () => {
    const { result } = await renderCommentedEditor(SOURCE);
    const editor = result.current.document.editor;
    if (!editor) {
      throw new Error("Editor did not mount.");
    }
    const before = getDocumentComments(editor.state.doc);

    act(() => {
      editor.commands.setTextSelection(2);
    });

    expect(getDocumentComments(editor.state.doc)).toBe(before);
    expect(result.current.comments.comments).toBe(before);
  });

  describe("highlights", () => {
    const highlighted = (
      editor: NonNullable<ReturnType<typeof useDocumentEditor>["editor"]>
    ) =>
      [...editor.view.dom.querySelectorAll('[data-comment-highlight="c1"]')]
        .map((element) => element.textContent)
        .join("");

    it("follow text typed before and inside the comment", async () => {
      const { result } = await renderCommentedEditor(SOURCE);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        editor.commands.insertContentAt(1, "Well, ");
      });
      expect(highlighted(editor)).toBe("there");

      act(() => {
        // Inside "there", after "th".
        editor.commands.insertContentAt(12, "XX");
      });
      expect(highlighted(editor)).toBe("thXXere");
    });

    it("come back when undo restores deleted commented text", async () => {
      const { result } = await renderCommentedEditor(SOURCE);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        editor
          .chain()
          .setTextSelection({ from: 4, to: 9 })
          .deleteSelection()
          .run();
      });
      expect(highlighted(editor)).toBe("");

      act(() => {
        editor.commands.undo();
      });
      expect(highlighted(editor)).toBe("there");
    });
  });

  describe("pasted and dropped content", () => {
    type MountedEditor = NonNullable<
      ReturnType<typeof useDocumentEditor>["editor"]
    >;
    const commentIds = (slice: Slice) => {
      const ids: string[] = [];
      slice.content.descendants((node) => {
        for (const mark of node.marks) {
          if (mark.type.name === "comment") {
            ids.push(mark.attrs.id);
          }
        }
      });
      return ids;
    };
    const transformPasted = (editor: MountedEditor, slice: Slice) => {
      let transformed = slice;
      editor.view.someProp("transformPasted", (transform) => {
        transformed = transform(transformed, editor.view, false);
      });
      return transformed;
    };
    const drop = (editor: MountedEditor, { copy }: { copy: boolean }) => {
      const event = new Event("drop", { bubbles: true });
      Object.assign(event, { altKey: copy, ctrlKey: copy });
      editor.view.dom.dispatchEvent(event);
    };

    const mounted = async () => {
      const { result } = await renderCommentedEditor(SOURCE);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }
      // "there", the commented word.
      return { editor, slice: editor.state.doc.slice(4, 9) };
    };

    it("drops comment marks from pasted content", async () => {
      const { editor, slice } = await mounted();
      expect(commentIds(slice)).toEqual(["c1"]);

      expect(commentIds(transformPasted(editor, slice))).toEqual([]);
    });

    it("drops comment marks from a copy dropped from a drag", async () => {
      const { editor, slice } = await mounted();

      drop(editor, { copy: true });
      editor.view.dragging = { slice, move: false };

      expect(commentIds(transformPasted(editor, slice))).toEqual([]);
    });

    it("keeps comment marks on text moved by a drag", async () => {
      const { editor, slice } = await mounted();

      drop(editor, { copy: false });
      editor.view.dragging = { slice, move: true };

      expect(commentIds(transformPasted(editor, slice))).toEqual(["c1"]);
    });
  });
});
