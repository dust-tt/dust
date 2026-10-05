import { useDocumentComments } from "@app/components/editor/document/useDocumentComments";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import type { DfmAuthor } from "@app/lib/markdown/dfm";
import { parseDfm } from "@app/lib/markdown/dfm";
import { Ok } from "@app/types/shared/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const AUTHOR: DfmAuthor = { kind: "user", id: "usr_tom", name: "Tom" };
const AT = "2026-09-25T14:16:32.380Z";

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function renderCommentingEditor(initialContent: string) {
  const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
  const rendered = renderHook(() => {
    const document = useDocumentEditor({
      initialContent,
      readOnly: false,
      autosaveDebounceMs: 60_000,
      onSave,
      onStateChange: undefined,
    });
    const comments = useDocumentComments({
      editor: document.editor,
      canComment: document.editable,
      author: AUTHOR,
    });
    return { document, comments };
  });
  await waitFor(() =>
    expect(rendered.result.current.document.editor).not.toBeNull()
  );
  await act(nextTick);
  return { ...rendered, onSave };
}

/** Selects the first occurrence of `text` in the editor. */
function select(
  editor: NonNullable<ReturnType<typeof useDocumentEditor>["editor"]>,
  text: string
) {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from === -1 && node.isText && node.text?.includes(text)) {
      from = pos + node.text.indexOf(text);
    }
  });
  editor.commands.setTextSelection({ from, to: from + text.length });
}

describe("useDocumentComments", () => {
  it("saves a new comment as an anchor pair and a thread", async () => {
    const { result, onSave } = await renderCommentingEditor(
      "Hello brave world.\n"
    );
    const editor = result.current.document.editor;
    if (!editor) {
      throw new Error("Editor did not mount.");
    }

    act(() => {
      select(editor, "brave");
      result.current.comments.startDraft();
    });
    act(() => {
      expect(result.current.comments.submitDraft("Too bold?").isOk()).toBe(
        true
      );
    });
    await act(() => result.current.document.save());

    expect(onSave).toHaveBeenCalledTimes(1);
    const source: string = onSave.mock.calls[0][0];
    const parsed = parseDfm(source);
    expect(parsed.isOk()).toBe(true);
    if (parsed.isOk()) {
      const [comment] = parsed.value.comments;
      expect(parsed.value.body).toBe(
        `Hello :comment-start{id=${comment.id}}brave:comment-end{id=${comment.id}} world.`
      );
      expect(comment.status).toBe("open");
      expect(comment.messages).toEqual([
        expect.objectContaining({ author: AUTHOR, body: "Too bold?" }),
      ]);
    }
  });

  it("replies, resolves and deletes through the thread in the file", async () => {
    const { result, onSave } = await renderCommentingEditor(
      `Hello :comment-start{id=c1}brave:comment-end{id=c1} world.\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nToo bold?\n:::\n`
    );
    expect(result.current.comments.quotes.get("c1")).toBe("brave");

    act(() => {
      expect(result.current.comments.reply("c1", "Not at all.").isOk()).toBe(
        true
      );
    });
    act(() => {
      result.current.comments.setResolved("c1", true, null);
    });
    await act(() => result.current.document.save());

    const replied = parseDfm(onSave.mock.calls[0][0]);
    expect(replied.isOk()).toBe(true);
    if (replied.isOk()) {
      expect(replied.value.comments[0].status).toBe("resolved");
      expect(replied.value.comments[0].messages.map((m) => m.body)).toEqual([
        "Too bold?",
        "Not at all.",
      ]);
    }

    act(() => {
      result.current.comments.remove("c1", null);
    });
    await act(() => result.current.document.save());

    expect(onSave.mock.calls[1][0]).toBe("Hello brave world.\n");
  });

  it("does not carry comment marks in pasted HTML", async () => {
    const { result, onSave } = await renderCommentingEditor(
      `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`
    );

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

  it("refuses a reply the codec cannot write, leaving the document unchanged", async () => {
    const { result } = await renderCommentingEditor(
      `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`
    );

    act(() => {
      expect(result.current.comments.reply("c1", "::message{}").isErr()).toBe(
        true
      );
    });

    expect(result.current.comments.comments[0].messages).toHaveLength(1);
    expect(result.current.document.dirty).toBe(false);
  });
});
