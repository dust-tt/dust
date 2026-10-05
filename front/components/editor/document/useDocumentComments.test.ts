import { useDocumentComments } from "@app/components/editor/document/useDocumentComments";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { Ok } from "@app/types/shared/result";
import { act, renderHook, waitFor } from "@testing-library/react";
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
});
