import { getMarkedCommentIds } from "@app/components/editor/document/DocumentCommentAnchor";
import { getDocumentComments } from "@app/components/editor/document/DocumentComments";
import { useDocumentComments } from "@app/components/editor/document/useDocumentComments";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import type { DfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import type { DfmAuthor, DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import { parseDfm } from "@app/lib/markdown/dfm";
import type {
  LiveCommentCommand,
  LiveCommentErrorCode,
} from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import type { Slice } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { Decoration } from "@tiptap/pm/view";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const AUTHOR: DfmAuthor = { kind: "user", id: "usr_tom", name: "Tom" };
const AT = "2026-09-25T14:16:32.380Z";
const SOURCE = `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`;

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function renderCommentedEditor(
  initialContent: string,
  {
    sign,
    verify,
    isSavable,
    live,
  }: {
    live?: LiveCommentChannel;
    sign?: (
      commentId: string,
      thread: DfmMessage[],
      body: string
    ) => Promise<Result<DfmMessage, string>>;
    verify?: DfmMessageVerifier;
    isSavable?: (document: JSONContent) => boolean;
  } = {}
) {
  const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
  const rendered = renderHook(
    ({ currentVerify }: { currentVerify?: DfmMessageVerifier }) => {
      const document = useDocumentEditor({
        initialContent,
        readOnly: false,
        autosaveDebounceMs: 60_000,
        onSave,
        onStateChange: undefined,
        resolveImageSource: () => null,
      });
      const comments = useDocumentComments({
        editor: document.editor,
        canComment: document.editable,
        author: AUTHOR,
        isSavable: isSavable ?? document.isSavable,
        sign,
        verify: currentVerify,
        live,
      });
      return { document, comments };
    },
    { initialProps: { currentVerify: verify } }
  );
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

const SIGNED_AT = "2026-10-05T12:00:00.000Z";

/** A live session's comment side whose answers the test gives. */
function liveChannel(
  answer: (
    command: LiveCommentCommand
  ) => Result<DfmComment | null, LiveCommentErrorCode>
) {
  const send = vi.fn(async (command: LiveCommentCommand) => answer(command));
  const channel: LiveCommentChannel = {
    getThreads: () => null,
    onThreads: () => () => undefined,
    send,
    close: () => undefined,
  };
  return { channel, send };
}

const sessionThread = (id: string, body: string): DfmComment => ({
  id,
  status: "open",
  messages: [
    {
      author: { ...AUTHOR, name: "Tom (server)" },
      createdAt: SIGNED_AT,
      body,
    },
  ],
});

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
    await act(async () => {
      expect(
        (await result.current.comments.submitDraft("Too bold?")).isOk()
      ).toBe(true);
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

    await act(async () => {
      expect(
        (await result.current.comments.submitDraft("Too bold?")).isErr()
      ).toBe(true);
    });
    expect(result.current.comments.comments).toHaveLength(0);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it("refuses a reply the document could not be saved with", async () => {
    const { result } = await renderCommentedEditor(
      `${"a".repeat(100_000)}\n\n${SOURCE}`
    );

    await act(async () => {
      expect(
        (await result.current.comments.reply("c1", "b".repeat(170_000))).isErr()
      ).toBe(true);
    });

    expect(result.current.comments.comments[0].messages).toHaveLength(1);
    expect(result.current.document.dirty).toBe(false);
  });

  it("replies, resolves and deletes through the thread in the file", async () => {
    const { result, onSave } = await renderCommentedEditor(SOURCE);

    await act(async () => {
      expect(
        (await result.current.comments.reply("c1", "Not at all.")).isOk()
      ).toBe(true);
    });
    await act(async () => {
      await result.current.comments.setResolved("c1", true, null);
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

    await act(async () => {
      await result.current.comments.remove("c1", null);
    });
    await act(() => result.current.document.save());

    expect(onSave.mock.calls[1][0]).toBe("Hi there\n");
  });

  it("keeps a pending draft when a comment is revealed", async () => {
    const { result } = await renderCommentedEditor(SOURCE);
    const editor = result.current.document.editor;
    if (!editor) {
      throw new Error("Editor did not mount.");
    }

    act(() => {
      select(editor, "Hi");
      result.current.comments.startDraft();
    });
    act(() => {
      result.current.comments.reveal("c1");
    });

    expect(result.current.comments.draft).not.toBeNull();
    expect(result.current.comments.activeId).toBeNull();
  });

  it("ignores a thread action while another is pending, and shows its refusal until the thread changes", async () => {
    const { result } = await renderCommentedEditor(SOURCE);
    let refuse: (done: Result<void, string>) => void = () => undefined;
    let firstRun: Promise<Result<void, string> | null> = Promise.resolve(null);

    act(() => {
      firstRun = result.current.comments.runThreadAction(
        "c1",
        () =>
          new Promise<Result<void, string>>((resolve) => {
            refuse = resolve;
          })
      );
    });
    expect(result.current.comments.busyThreadIds.has("c1")).toBe(true);

    const second = vi.fn(async () => new Ok(undefined));
    await act(async () => {
      expect(
        await result.current.comments.runThreadAction("c1", second)
      ).toBeNull();
    });
    expect(second).not.toHaveBeenCalled();

    await act(async () => {
      refuse(new Err("Refused."));
      await firstRun;
    });
    expect(result.current.comments.busyThreadIds.has("c1")).toBe(false);
    expect(
      result.current.comments.threadError(result.current.comments.comments[0])
    ).toBe("Refused.");

    await act(async () => {
      await result.current.comments.reply("c1", "Done.");
    });
    expect(
      result.current.comments.threadError(result.current.comments.comments[0])
    ).toBeNull();
  });

  describe("in a live session", () => {
    it("has the session create the thread, then anchors it", async () => {
      const { channel, send } = liveChannel(
        (command) =>
          new Ok(
            command.type === "add"
              ? sessionThread(command.commentId, command.body)
              : null
          )
      );
      const { result, onSave } = await renderCommentedEditor(
        "Hello brave world.\n",
        { live: channel }
      );
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        select(editor, "brave");
        result.current.comments.startDraft();
      });
      await act(async () => {
        expect(
          (await result.current.comments.submitDraft("Too bold?")).isOk()
        ).toBe(true);
      });

      expect(send).toHaveBeenCalledTimes(1);
      const [command] = send.mock.calls[0];
      expect(command).toEqual({
        type: "add",
        commentId: expect.any(String),
        body: "Too bold?",
        quote: "brave",
      });
      expect(getMarkedCommentIds(editor.getJSON())).toEqual(
        new Set([command.commentId])
      );
      expect(result.current.comments.comments).toEqual([
        sessionThread(command.commentId, "Too bold?"),
      ]);
      expect(onSave).not.toHaveBeenCalled();
    });

    it("deletes the session's thread when the draft can no longer take it", async () => {
      const { channel, send } = liveChannel(
        (command) =>
          new Ok(
            command.type === "add"
              ? sessionThread(command.commentId, command.body)
              : null
          )
      );
      const { result } = await renderCommentedEditor("Hello brave world.\n", {
        live: channel,
      });
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }
      act(() => {
        select(editor, "brave");
        result.current.comments.startDraft();
      });
      // The draft goes while the session creates the thread.
      send.mockImplementationOnce(async (command) => {
        editor.commands.cancelCommentDraft();
        return new Ok(
          command.type === "add"
            ? sessionThread(command.commentId, command.body)
            : null
        );
      });

      await act(async () => {
        expect(
          (await result.current.comments.submitDraft("Too bold?")).isErr()
        ).toBe(true);
      });

      const [[added], [deleted]] = send.mock.calls;
      expect(deleted).toEqual({ type: "delete", commentId: added.commentId });
      expect(getMarkedCommentIds(editor.getJSON()).size).toBe(0);
    });

    it("replies, resolves and deletes through the session", async () => {
      const { channel, send } = liveChannel(() => new Ok(null));
      const { result } = await renderCommentedEditor(SOURCE, {
        live: channel,
      });
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      await act(async () => {
        expect(
          (await result.current.comments.reply("c1", "Not at all.")).isOk()
        ).toBe(true);
      });
      await act(async () => {
        await result.current.comments.setResolved("c1", true, null);
      });

      expect(send.mock.calls.map(([command]) => command)).toEqual([
        { type: "reply", commentId: "c1", position: 1, body: "Not at all." },
        { type: "resolve", commentId: "c1", resolved: true },
      ]);
      // The session sends the threads back; nothing changes them here.
      expect(result.current.comments.comments[0].messages).toHaveLength(1);
      expect(result.current.comments.comments[0].status).toBe("open");

      await act(async () => {
        await result.current.comments.remove("c1", null);
      });

      expect(send).toHaveBeenLastCalledWith({
        type: "delete",
        commentId: "c1",
      });
      expect(getMarkedCommentIds(editor.getJSON()).size).toBe(0);
    });

    it("refuses a reply the document could not be saved with, before the session sees it", async () => {
      const { channel, send } = liveChannel(() => new Ok(null));
      const { result } = await renderCommentedEditor(
        `${"a".repeat(100_000)}\n\n${SOURCE}`,
        { live: channel }
      );

      await act(async () => {
        expect(
          (
            await result.current.comments.reply("c1", "b".repeat(170_000))
          ).isErr()
        ).toBe(true);
      });
      expect(send).not.toHaveBeenCalled();
    });

    it("refuses a new comment or reply too large once signed, before the session sees it", async () => {
      const { channel, send } = liveChannel(() => new Ok(null));
      const { result } = await renderCommentedEditor(SOURCE, {
        live: channel,
        isSavable: (document) =>
          !JSON.stringify(document).includes('"signature"'),
      });
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        select(editor, "Hi");
        result.current.comments.startDraft();
      });
      await act(async () => {
        expect(
          (await result.current.comments.submitDraft("Too bold?")).isErr()
        ).toBe(true);
        expect(
          (await result.current.comments.reply("c1", "Not at all.")).isErr()
        ).toBe(true);
      });
      expect(send).not.toHaveBeenCalled();
    });

    it("tells a reply to a thread deleted since the last render that it was deleted", async () => {
      const { channel, send } = liveChannel(() => new Ok(null));
      const { result } = await renderCommentedEditor(SOURCE, {
        live: channel,
      });
      const { comments, document } = result.current;

      act(() => {
        document.editor?.commands.setCommentThreads([]);
      });

      const replied = await comments.reply("c1", "Not at all.");
      expect(replied.isErr() && replied.error).toBe(
        "This comment was deleted."
      );
      expect(send).not.toHaveBeenCalled();
    });

    it("reports a resolve or delete the session refuses, keeping the thread and its marks", async () => {
      const { channel } = liveChannel(() => new Err("unavailable"));
      const { result } = await renderCommentedEditor(SOURCE, {
        live: channel,
      });
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      await act(async () => {
        expect(
          (await result.current.comments.setResolved("c1", true, null)).isErr()
        ).toBe(true);
        expect((await result.current.comments.remove("c1", null)).isErr()).toBe(
          true
        );
      });

      expect(result.current.comments.comments.map(({ id }) => id)).toEqual([
        "c1",
      ]);
      expect(getMarkedCommentIds(editor.getJSON())).toEqual(new Set(["c1"]));
    });

    it("removes the marks of a thread the session no longer has", async () => {
      const { channel } = liveChannel(() => new Err("not_found"));
      const { result } = await renderCommentedEditor(SOURCE, {
        live: channel,
      });
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      await act(async () => {
        expect((await result.current.comments.remove("c1", null)).isOk()).toBe(
          true
        );
      });

      expect(getMarkedCommentIds(editor.getJSON()).size).toBe(0);
    });

    it("deletes a thread the session accepted without returning it", async () => {
      const { channel, send } = liveChannel(() => new Ok(null));
      const { result } = await renderCommentedEditor("Hello brave world.\n", {
        live: channel,
      });
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }
      act(() => {
        select(editor, "brave");
        result.current.comments.startDraft();
      });

      await act(async () => {
        expect(
          (await result.current.comments.submitDraft("Too bold?")).isErr()
        ).toBe(true);
      });

      const [[added], [deleted]] = send.mock.calls;
      expect(deleted).toEqual({ type: "delete", commentId: added.commentId });
    });

    it("deletes a thread the session returned that the codec cannot write, without anchoring it", async () => {
      const { channel, send } = liveChannel(
        (command) =>
          new Ok(
            command.type === "add"
              ? sessionThread(
                  command.commentId,
                  "First line\n::message{author=user:x}"
                )
              : null
          )
      );
      const { result } = await renderCommentedEditor("Hello brave world.\n", {
        live: channel,
      });
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }
      act(() => {
        select(editor, "brave");
        result.current.comments.startDraft();
      });

      await act(async () => {
        expect(
          (await result.current.comments.submitDraft("Too bold?")).isErr()
        ).toBe(true);
      });

      const [[added], [deleted]] = send.mock.calls;
      expect(deleted).toEqual({ type: "delete", commentId: added.commentId });
      expect(getMarkedCommentIds(editor.getJSON()).size).toBe(0);
    });

    it("comments in a document holding marks whose thread is gone", async () => {
      const { channel, send } = liveChannel(
        (command) =>
          new Ok(
            command.type === "add"
              ? sessionThread(command.commentId, command.body)
              : null
          )
      );
      const { result } = await renderCommentedEditor(SOURCE, {
        live: channel,
      });
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }
      act(() => {
        editor.commands.setCommentThreads([]);
      });
      expect(getMarkedCommentIds(editor.getJSON())).toEqual(new Set(["c1"]));

      act(() => {
        select(editor, "Hi");
        result.current.comments.startDraft();
      });
      await act(async () => {
        expect(
          (await result.current.comments.submitDraft("Too bold?")).isOk()
        ).toBe(true);
      });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("keeps an applied suggestion's text and reports why the session refused its resolution", async () => {
      const { channel, send } = liveChannel(() => new Err("not_found"));
      const { result } = await renderCommentedEditor(SOURCE, {
        live: channel,
      });

      await act(async () => {
        const applied = await result.current.comments.applySuggestion(
          "c1",
          "here",
          null
        );
        expect(applied.isErr() && applied.error).toContain(
          "This comment was deleted."
        );
      });

      expect(send).toHaveBeenCalledWith({
        type: "resolve",
        commentId: "c1",
        resolved: true,
      });
      expect(result.current.comments.quotes.get("c1")).toBe("here");
      expect(result.current.comments.comments[0].status).toBe("open");
    });

    it("refuses a reply the session refuses", async () => {
      const { channel } = liveChannel(() => new Err("thread_changed"));
      const { result } = await renderCommentedEditor(SOURCE, {
        live: channel,
      });

      await act(async () => {
        expect(
          (await result.current.comments.reply("c1", "Late.")).isErr()
        ).toBe(true);
      });
    });
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
    await act(async () => {
      await result.current.comments.remove("c1", null);
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

    await act(async () => {
      expect(
        (await result.current.comments.reply("c1", "::message{}")).isErr()
      ).toBe(true);
    });

    expect(result.current.comments.comments[0].messages).toHaveLength(1);
    expect(result.current.document.dirty).toBe(false);
  });

  it("inserts the message the server signed, with the server's name and time", async () => {
    const sign = vi.fn(
      async (_commentId: string, _thread: DfmMessage[], body: string) =>
        new Ok<DfmMessage>({
          author: { ...AUTHOR, name: "Tom Draier" },
          createdAt: SIGNED_AT,
          body,
          signature: "server-signature",
        })
    );
    const { result, onSave } = await renderCommentedEditor(SOURCE, { sign });

    await act(async () => {
      expect(
        (await result.current.comments.reply("c1", "Agreed.")).isOk()
      ).toBe(true);
    });
    await act(() => result.current.document.save());

    expect(sign).toHaveBeenCalledWith(
      "c1",
      [expect.objectContaining({ body: "Note." })],
      "Agreed."
    );
    expect(result.current.comments.comments[0].messages[1]).toEqual({
      author: { ...AUTHOR, name: "Tom Draier" },
      createdAt: SIGNED_AT,
      body: "Agreed.",
      signature: "server-signature",
    });
    expect(onSave.mock.calls[0][0]).toContain(
      `name="Tom Draier" at=${SIGNED_AT} sig=server-signature}`
    );
  });

  it("refuses a reply signed after a message that is no longer the thread's last", async () => {
    let appendWhileSigning = () => undefined as unknown;
    const sign = vi.fn(
      async (_commentId: string, _thread: DfmMessage[], body: string) => {
        appendWhileSigning();
        return new Ok<DfmMessage>({
          author: AUTHOR,
          createdAt: SIGNED_AT,
          body,
          signature: "server-signature",
        });
      }
    );
    const { result } = await renderCommentedEditor(SOURCE, { sign });
    appendWhileSigning = () =>
      result.current.document.editor?.commands.replyToComment("c1", {
        author: AUTHOR,
        createdAt: SIGNED_AT,
        body: "Sent elsewhere.",
      });

    await act(async () => {
      expect(
        (await result.current.comments.reply("c1", "Agreed.")).isErr()
      ).toBe(true);
    });

    expect(
      result.current.comments.comments[0].messages.map(({ body }) => body)
    ).toEqual(["Note.", "Sent elsewhere."]);
  });

  it("leaves the document unchanged when the server refuses to sign", async () => {
    const sign = vi.fn(
      async () => new Err("Commenting is not available here.")
    );
    const { result } = await renderCommentedEditor(SOURCE, { sign });

    await act(async () => {
      const replied = await result.current.comments.reply("c1", "Agreed.");
      expect(replied.isErr() && replied.error).toBe(
        "Commenting is not available here."
      );
    });

    expect(result.current.comments.comments[0].messages).toHaveLength(1);
    expect(result.current.document.dirty).toBe(false);
  });

  it("does not ask the server to sign a message the codec cannot write", async () => {
    const sign = vi.fn();
    const { result } = await renderCommentedEditor(SOURCE, { sign });

    await act(async () => {
      expect(
        (await result.current.comments.reply("c1", "::message{}")).isErr()
      ).toBe(true);
    });

    expect(sign).not.toHaveBeenCalled();
  });

  it("reads each message as verified or not from the verifier", async () => {
    const signedSource = SOURCE.replace(
      `at=${AT}}`,
      `at=${AT} sig=good}`
    ).replace(
      "Note.\n:::",
      `Note.\n\n::message{author=agent:dust name="@dust" at=${AT}}\n\nUnsigned.\n:::`
    );
    const verify = vi.fn(
      async (_commentId: string, messages: DfmMessage[], index: number) =>
        messages[index].signature === "good"
    );
    const { result } = await renderCommentedEditor(signedSource, { verify });

    await waitFor(() =>
      expect(result.current.comments.isVerified("c1", 0)).toBe(true)
    );
    expect(result.current.comments.isVerified("c1", 1)).toBe(false);
    expect(verify).toHaveBeenCalledWith(
      "c1",
      [
        expect.objectContaining({ body: "Note." }),
        expect.objectContaining({ body: "Unsigned." }),
      ],
      1
    );
  });

  it("checks again only the messages a change to the threads adds", async () => {
    const verify = vi.fn(
      async (_commentId: string, _messages: DfmMessage[], _index: number) =>
        true
    );
    const { result } = await renderCommentedEditor(SOURCE, { verify });
    await waitFor(() =>
      expect(result.current.comments.isVerified("c1", 0)).toBe(true)
    );

    await act(async () => {
      await result.current.comments.reply("c1", "Not at all.");
    });
    await waitFor(() =>
      expect(result.current.comments.isVerified("c1", 1)).toBe(true)
    );

    expect(verify.mock.calls.map(([, , index]) => index)).toEqual([0, 1]);
  });

  it("keeps the answer for unchanged messages while new ones are checked", async () => {
    const verify = vi.fn(
      (_commentId: string, _messages: DfmMessage[], index: number) =>
        index === 0
          ? Promise.resolve(true)
          : new Promise<boolean>(() => undefined)
    );
    const { result } = await renderCommentedEditor(SOURCE, { verify });
    await waitFor(() =>
      expect(result.current.comments.isVerified("c1", 0)).toBe(true)
    );

    await act(async () => {
      await result.current.comments.reply("c1", "Not at all.");
    });

    expect(result.current.comments.isVerified("c1", 0)).toBe(true);
    expect(result.current.comments.isVerified("c1", 1)).toBeNull();
  });

  it("checks a reply's savability once when nothing writes it elsewhere", async () => {
    const isSavable = vi.fn(() => true);
    const { result } = await renderCommentedEditor(SOURCE, { isSavable });

    await act(async () => {
      expect(
        (await result.current.comments.reply("c1", "Not at all.")).isOk()
      ).toBe(true);
    });

    expect(isSavable).toHaveBeenCalledTimes(1);
  });

  it("reads messages as unknown again while a new verifier checks them", async () => {
    const { result, rerender } = await renderCommentedEditor(SOURCE, {
      verify: async () => true,
    });
    await waitFor(() =>
      expect(result.current.comments.isVerified("c1", 0)).toBe(true)
    );

    rerender({ currentVerify: () => new Promise<boolean>(() => undefined) });

    expect(result.current.comments.isVerified("c1", 0)).toBeNull();
  });

  it("refuses a reply when the document turns read-only while it is signed", async () => {
    let turnReadOnly = () => undefined as unknown;
    const sign = vi.fn(
      async (_commentId: string, _thread: DfmMessage[], body: string) => {
        turnReadOnly();
        return new Ok<DfmMessage>({
          author: AUTHOR,
          createdAt: SIGNED_AT,
          body,
          signature: "server-signature",
        });
      }
    );
    const { result } = await renderCommentedEditor(SOURCE, { sign });
    turnReadOnly = () => result.current.document.editor?.setEditable(false);

    await act(async () => {
      expect(
        (await result.current.comments.reply("c1", "Agreed.")).isErr()
      ).toBe(true);
    });

    expect(result.current.comments.comments[0].messages).toHaveLength(1);
  });

  it("reads every message as unknown without a verifier", async () => {
    const { result } = await renderCommentedEditor(SOURCE);

    expect(result.current.comments.isVerified("c1", 0)).toBeNull();
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

  describe("suggestions", () => {
    const thread = (status = "open") =>
      `:::annotations\n::comment{id=c1 status=${status}}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`;

    it("offers the commented text as Markdown, which applied unchanged keeps the text", async () => {
      const source = `Hi **:comment-start{id=c1}brave:comment-end{id=c1}** world\n\n${thread()}`;
      const { result, onSave } = await renderCommentedEditor(source);

      const template = result.current.comments.suggestionTemplate("c1");
      expect(template.isOk() && template.value).toBe(
        "```suggestion\n**brave**\n```"
      );

      await act(async () => {
        expect(
          (
            await result.current.comments.applySuggestion(
              "c1",
              "**brave**",
              null
            )
          ).isOk()
        ).toBe(true);
      });
      await act(() => result.current.document.save());

      expect(onSave.mock.calls[0][0]).toBe(
        source.replace("status=open", "status=resolved")
      );
    });

    it("replaces the commented text, keeps the comment on it and resolves the thread", async () => {
      const { result, onSave } = await renderCommentedEditor(SOURCE);

      await act(async () => {
        expect(
          (
            await result.current.comments.applySuggestion(
              "c1",
              "*over* here",
              null
            )
          ).isOk()
        ).toBe(true);
      });
      await act(() => result.current.document.save());

      expect(onSave.mock.calls[0][0]).toBe(
        SOURCE.replace(
          ":comment-start{id=c1}there:comment-end{id=c1}",
          "*:comment-start{id=c1}over* here:comment-end{id=c1}"
        ).replace("status=open", "status=resolved")
      );
    });

    it("undoes the text change and leaves the thread resolved", async () => {
      const { result } = await renderCommentedEditor(SOURCE);

      await act(async () => {
        await result.current.comments.applySuggestion("c1", "here", null);
      });
      act(() => {
        result.current.document.editor?.commands.undo();
      });

      expect(result.current.comments.quotes.get("c1")).toBe("there");
      expect(result.current.comments.comments[0].status).toBe("resolved");
    });

    it("deletes the commented text with an empty suggestion", async () => {
      const { result } = await renderCommentedEditor(SOURCE);

      await act(async () => {
        expect(
          (await result.current.comments.applySuggestion("c1", "", null)).isOk()
        ).toBe(true);
      });

      expect(result.current.document.editor?.getText()).toBe("Hi ");
      expect(result.current.comments.quotes.has("c1")).toBe(false);
    });

    it.each([
      ["several paragraphs", "One\n\nTwo"],
      ["a heading", "# Title"],
      ["a comment anchor", ":comment-start{id=c2}x:comment-end{id=c2}"],
    ])("refuses %s, leaving the document unchanged", async (_, suggestion) => {
      const { result } = await renderCommentedEditor(SOURCE);

      let applied: Result<void, string> | undefined;
      await act(async () => {
        applied = await result.current.comments.applySuggestion(
          "c1",
          suggestion,
          null
        );
      });

      expect(applied?.isErr()).toBe(true);
      expect(result.current.comments.quotes.get("c1")).toBe("there");
      expect(result.current.comments.comments[0].status).toBe("open");
      expect(result.current.document.dirty).toBe(false);
    });

    it("refuses a suggestion the document could not be saved with once resolved", async () => {
      const { result } = await renderCommentedEditor(SOURCE, {
        isSavable: (document) =>
          !JSON.stringify(document).includes('"status":"resolved"'),
      });

      let applied: Result<void, string> | undefined;
      await act(async () => {
        applied = await result.current.comments.applySuggestion(
          "c1",
          "here",
          null
        );
      });

      expect(applied?.isErr()).toBe(true);
      expect(result.current.comments.quotes.get("c1")).toBe("there");
      expect(result.current.comments.comments[0].status).toBe("open");
      expect(result.current.document.dirty).toBe(false);
    });

    it("refuses a comment spanning paragraphs", async () => {
      const { result } = await renderCommentedEditor(
        `:comment-start{id=c1}One\n\nTwo:comment-end{id=c1}\n\n${thread()}`
      );

      expect(result.current.comments.suggestable.has("c1")).toBe(false);
      expect(result.current.comments.suggestionTemplate("c1").isErr()).toBe(
        true
      );
      let applied: Result<void, string> | undefined;
      await act(async () => {
        applied = await result.current.comments.applySuggestion(
          "c1",
          "Three",
          null
        );
      });
      expect(applied?.isErr()).toBe(true);
      expect(result.current.document.dirty).toBe(false);
    });

    const threads = (...ids: string[]) =>
      `:::annotations\n${ids
        .map(
          (id) =>
            `::comment{id=${id} status=open}\n\n::message{author=user:u name="U" at=${AT}}\n\nNote.\n`
        )
        .join("\n")}:::\n`;

    it("keeps an enclosing comment over the replacement", async () => {
      const source = `the :comment-start{id=c2}quick :comment-start{id=c1}brown:comment-end{id=c1} fox:comment-end{id=c2}\n\n${threads("c1", "c2")}`;
      const { result, onSave } = await renderCommentedEditor(source);

      await act(async () => {
        expect(
          (
            await result.current.comments.applySuggestion("c1", "red", null)
          ).isOk()
        ).toBe(true);
      });
      await act(() => result.current.document.save());

      expect(result.current.comments.quotes.get("c2")).toBe("quick red fox");
      expect(onSave.mock.calls[0][0]).toBe(
        source
          .replace("brown", "red")
          .replace("{id=c1 status=open}", "{id=c1 status=resolved}")
      );
    });

    it.each([
      [
        "a comment inside it",
        `:comment-start{id=c1}alpha :comment-start{id=c2}beta:comment-end{id=c2} gamma:comment-end{id=c1}`,
        "delta",
      ],
      [
        "a comment over its edge",
        `:comment-start{id=c2}alpha :comment-start{id=c1}beta:comment-end{id=c2} gamma:comment-end{id=c1}`,
        "delta",
      ],
      [
        "a comment on the same text",
        `:comment-start{id=c2}:comment-start{id=c1}beta:comment-end{id=c1}:comment-end{id=c2}`,
        "",
      ],
    ])(
      "refuses to remove text %s holds, leaving the document unchanged",
      async (_, text, suggestion) => {
        const { result } = await renderCommentedEditor(
          `${text}\n\n${threads("c1", "c2")}`
        );
        const quote = result.current.comments.quotes.get("c2");

        let applied: Result<void, string> | undefined;
        await act(async () => {
          applied = await result.current.comments.applySuggestion(
            "c1",
            suggestion,
            null
          );
        });

        expect(applied?.isErr()).toBe(true);
        expect(result.current.comments.quotes.get("c2")).toBe(quote);
        expect(result.current.comments.comments[0].status).toBe("open");
        expect(result.current.document.dirty).toBe(false);
      }
    );

    it("leaves the thread open when the text change is not applied", async () => {
      const { result } = await renderCommentedEditor(SOURCE);
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }
      editor.registerPlugin(
        new Plugin({
          filterTransaction: (tr) =>
            !tr.steps.some((step) => step instanceof ReplaceStep),
        })
      );

      let applied: Result<void, string> | undefined;
      await act(async () => {
        applied = await result.current.comments.applySuggestion(
          "c1",
          "here",
          null
        );
      });

      expect(applied?.isErr()).toBe(true);
      expect(result.current.comments.quotes.get("c1")).toBe("there");
      expect(result.current.comments.comments[0].status).toBe("open");
    });

    it("refuses a resolved thread", async () => {
      const { result } = await renderCommentedEditor(
        SOURCE.replace("status=open", "status=resolved")
      );

      expect(
        (
          await result.current.comments.applySuggestion("c1", "here", null)
        ).isErr()
      ).toBe(true);
      expect(result.current.comments.quotes.get("c1")).toBe("there");
    });

    it("refuses a thread resolved since the last render", async () => {
      const { result } = await renderCommentedEditor(SOURCE);
      const { comments } = result.current;

      await act(async () => {
        void comments.setResolved("c1", true, null);
        expect(
          (await comments.applySuggestion("c1", "here", null)).isErr()
        ).toBe(true);
      });
      expect(result.current.comments.quotes.get("c1")).toBe("there");
    });

    it("offers the draft's text as a suggestion", async () => {
      const { result } = await renderCommentedEditor("Hello brave world.\n");
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        select(editor, "brave");
        result.current.comments.startDraft();
      });

      expect(result.current.comments.draftSuggestable).toBe(true);
      const template = result.current.comments.draftSuggestionTemplate();
      expect(template.isOk() && template.value).toBe(
        "```suggestion\nbrave\n```"
      );
    });

    it("leaves out of the draft's template the edges its comment cannot anchor", async () => {
      const { result } = await renderCommentedEditor("Hello wor`x`ld.\n");
      const editor = result.current.document.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }

      act(() => {
        select(editor, "wor");
        const { from } = editor.state.selection;
        editor.commands.setTextSelection({ from, to: from + "worx".length });
        result.current.comments.startDraft();
      });

      const template = result.current.comments.draftSuggestionTemplate();
      expect(template.isOk() && template.value).toBe("```suggestion\nwor\n```");
    });
  });
});
