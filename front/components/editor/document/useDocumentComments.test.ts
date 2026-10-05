import { getDocumentComments } from "@app/components/editor/document/DocumentComments";
import { useDocumentComments } from "@app/components/editor/document/useDocumentComments";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import type { DfmAuthor } from "@app/lib/markdown/dfm";
import { parseDfm } from "@app/lib/markdown/dfm";
import { Ok } from "@app/types/shared/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Slice } from "@tiptap/pm/model";
import { Decoration } from "@tiptap/pm/view";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const AUTHOR: DfmAuthor = { kind: "user", id: "usr_tom", name: "Tom" };
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
    const comments = useDocumentComments({
      editor: document.editor,
      canComment: document.editable,
      author: AUTHOR,
      isSavable: document.isSavable,
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

  it("saves a new comment as an anchor pair and a thread", async () => {
    const { result, onSave } = await renderCommentedEditor(
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
    const parsed = parseDfm(onSave.mock.calls[0][0]);
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

  it("refuses a draft whose text can no longer take a comment", async () => {
    const { result } = await renderCommentedEditor("Hello brave world.\n");
    const editor = result.current.document.editor;
    if (!editor) {
      throw new Error("Editor did not mount.");
    }

    act(() => {
      select(editor, "brave");
      result.current.comments.startDraft();
    });
    act(() => {
      editor.commands.setCodeBlock();
    });
    const before = JSON.stringify(editor.getJSON());

    act(() => {
      expect(result.current.comments.submitDraft("Too bold?").isErr()).toBe(
        true
      );
    });
    expect(result.current.comments.comments).toHaveLength(0);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it("refuses a reply the document could not be saved with", async () => {
    const { result } = await renderCommentedEditor(
      `${"a".repeat(100_000)}\n\n${SOURCE}`
    );

    act(() => {
      expect(
        result.current.comments.reply("c1", "b".repeat(170_000)).isErr()
      ).toBe(true);
    });

    expect(result.current.comments.comments[0].messages).toHaveLength(1);
    expect(result.current.document.dirty).toBe(false);
  });

  it("replies, resolves and deletes through the thread in the file", async () => {
    const { result, onSave } = await renderCommentedEditor(SOURCE);

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
        "Note.",
        "Not at all.",
      ]);
    }

    act(() => {
      result.current.comments.remove("c1", null);
    });
    await act(() => result.current.document.save());

    expect(onSave.mock.calls[1][0]).toBe("Hi there\n");
  });

  it("saves text an undo restores after its comment was deleted, without the comment", async () => {
    const { result, onSave } = await renderCommentedEditor(SOURCE);
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
    act(() => {
      result.current.comments.remove("c1", null);
    });
    act(() => {
      editor.commands.undo();
    });
    await act(() => result.current.document.save());

    expect(result.current.document.error).toBeNull();
    expect(onSave.mock.calls[0][0]).toBe("Hi there\n");

    act(() => {
      editor.commands.redo();
    });
    expect(editor.state.doc.textContent).toBe("Hi ");

    act(() => {
      editor.commands.undo();
    });
    expect(editor.state.doc.textContent).toBe("Hi there");
    expect(editor.getHTML()).not.toContain("data-comment-id");
  });

  it("refuses a reply the codec cannot write, leaving the document unchanged", async () => {
    const { result } = await renderCommentedEditor(SOURCE);

    act(() => {
      expect(result.current.comments.reply("c1", "::message{}").isErr()).toBe(
        true
      );
    });

    expect(result.current.comments.comments[0].messages).toHaveLength(1);
    expect(result.current.document.dirty).toBe(false);
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

    it("are rebuilt only in the paragraph being typed in", async () => {
      const thread = (id: string) =>
        `::comment{id=${id} status=open}\n\n::message{author=user:u name="U" at=${AT}}\n\nNote.\n`;
      const { result } = await renderCommentedEditor(
        `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\nYo :comment-start{id=c2}friend:comment-end{id=c2}\n\n:::annotations\n${thread("c1")}${thread("c2")}:::\n`
      );
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }
      const built = vi.spyOn(Decoration, "inline");

      act(() => {
        // Inside "friend", after "fr".
        editor.commands.insertContentAt(16, "XX");
      });

      expect(built.mock.calls.map(([from, to]) => [from, to])).toEqual([
        [14, 22],
      ]);
      expect(highlighted(editor)).toBe("there");
      expect(
        editor.view.dom.querySelector('[data-comment-highlight="c2"]')
          ?.textContent
      ).toBe("frXXiend");
      built.mockRestore();
    });

    it("keep the draft highlight while typing in its paragraph", async () => {
      const { result } = await renderCommentedEditor(SOURCE);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        editor
          .chain()
          .setTextSelection({ from: 1, to: 3 })
          .startCommentDraft()
          .run();
      });
      act(() => {
        editor.commands.insertContentAt(4, "X");
      });

      expect(
        editor.view.dom.querySelector("[data-comment-draft]")?.textContent
      ).toBe("Hi");
    });

    it("go away when the commented text is replaced", async () => {
      const { result } = await renderCommentedEditor(SOURCE);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        editor
          .chain()
          .setTextSelection({ from: 4, to: 9 })
          .insertContent("new")
          .run();
      });

      expect(highlighted(editor)).toBe("");
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
    // jsdom has no ClipboardEvent, which ProseMirror builds for a programmatic paste.
    beforeAll(() => {
      vi.stubGlobal(
        "ClipboardEvent",
        class extends Event {
          clipboardData = null;
        }
      );
    });
    afterAll(() => {
      vi.unstubAllGlobals();
    });
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

      editor.commands.setTextSelection({ from: 4, to: 9 });
      drop(editor, { copy: false });
      editor.view.dragging = { slice, move: true };

      expect(commentIds(transformPasted(editor, slice))).toEqual(["c1"]);
    });

    it("drops the mark of a comment a drag moves only part of", async () => {
      const { editor } = await mounted();
      const part = editor.state.doc.slice(4, 6);

      editor.commands.setTextSelection({ from: 4, to: 6 });
      drop(editor, { copy: false });
      editor.view.dragging = { slice: part, move: true };

      expect(commentIds(transformPasted(editor, part))).toEqual([]);
    });

    it("inherits the comment it is pasted inside", async () => {
      const { result, onSave } = await renderCommentedEditor(SOURCE);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        // Inside "there", after "th".
        editor.commands.setTextSelection(6);
        editor.view.pasteHTML("<strong>XX</strong>");
      });
      await act(() => result.current.document.save());

      expect(result.current.document.error).toBeNull();
      expect(onSave.mock.calls[0][0]).toContain(
        "Hi :comment-start{id=c1}th**XX**ere:comment-end{id=c1}"
      );
    });

    it("does not inherit the comment it is pasted next to", async () => {
      const { result, onSave } = await renderCommentedEditor(SOURCE);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        editor.commands.setTextSelection(4);
        editor.view.pasteText("XX");
      });
      await act(() => result.current.document.save());

      expect(onSave.mock.calls[0][0]).toContain(
        "Hi XX:comment-start{id=c1}there:comment-end{id=c1}"
      );
    });
  });

  it("quotes all the commented text, inline code and block breaks included", async () => {
    const thread = `:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:u name="U" at=${AT}}\n\nNote.\n:::\n`;
    const { result } = await renderCommentedEditor(
      `:comment-start{id=c1}run \`npm test\` now\n\nand then:comment-end{id=c1} ship\n\n${thread}`
    );

    expect(result.current.comments.quotes.get("c1")).toBe(
      "run npm test now and then"
    );
  });

  describe("inline code", () => {
    const TAGGED = `Hi :comment-start{id=c1}run all tests:comment-end{id=c1} now\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`;

    it.each([
      ["its last word", 12, 17],
      ["its first word", 4, 7],
      ["all of it", 4, 17],
    ])(
      "is refused over %s, which would shrink the comment",
      async (_, from, to) => {
        const { result } = await renderCommentedEditor(TAGGED);
        const editor = result.current.document.editor;
        if (!editor) {
          throw new Error("Editor did not mount.");
        }
        const before = editor.state.doc;

        act(() => {
          editor.chain().setTextSelection({ from, to }).toggleCode().run();
        });

        expect(editor.state.doc.eq(before)).toBe(true);
        expect(result.current.comments.quotes.get("c1")).toBe("run all tests");
      }
    );

    it("is refused as a code block over a comment", async () => {
      const { result } = await renderCommentedEditor(TAGGED);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }
      const before = editor.state.doc;

      act(() => {
        editor.chain().setTextSelection(2).toggleCodeBlock().run();
      });

      expect(editor.state.doc.eq(before)).toBe(true);
    });

    it("applies inside a comment, which keeps its anchors around it", async () => {
      const { result, onSave } = await renderCommentedEditor(TAGGED);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        editor.chain().setTextSelection({ from: 8, to: 11 }).toggleCode().run();
      });
      await act(() => result.current.document.save());

      expect(result.current.document.error).toBeNull();
      expect(onSave.mock.calls[0][0]).toContain(
        "Hi :comment-start{id=c1}run `all` tests:comment-end{id=c1} now"
      );
    });
  });

  it("quotes overlapping comments each over their own text", async () => {
    const thread = (id: string) =>
      `::comment{id=${id} status=open}\n\n::message{author=user:u name="U" at=${AT}}\n\nNote.\n`;
    const { result } = await renderCommentedEditor(
      `a :comment-start{id=c2}b :comment-start{id=c1}c\n\nd:comment-end{id=c1} e:comment-end{id=c2} f\n\n:::annotations\n${thread("c1")}${thread("c2")}:::\n`
    );

    expect(result.current.comments.quotes.get("c1")).toBe("c d");
    expect(result.current.comments.quotes.get("c2")).toBe("b c d e");
  });

  it("highlights a resolved comment while its thread is selected", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    const { result } = await renderCommentedEditor(
      SOURCE.replace("status=open", "status=resolved")
    );
    const editor = result.current.document.editor;
    if (!editor) {
      throw new Error("Editor did not mount.");
    }
    const highlight = () =>
      editor.view.dom.querySelector('[data-comment-highlight="c1"]');
    expect(highlight()).toBeNull();

    act(() => {
      result.current.comments.jumpTo("c1");
    });
    expect(highlight()?.textContent).toBe("there");
    expect(scrollIntoView).toHaveBeenCalled();

    act(() => {
      result.current.comments.select(null);
    });
    expect(highlight()).toBeNull();
  });
});
