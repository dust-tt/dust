import { documentSchema } from "@app/components/editor/document/content";
import { loadDfm } from "@app/components/editor/document/dfm_persistence";
import { getMarkedCommentIds } from "@app/components/editor/document/DocumentCommentAnchor";
import {
  getDocumentComments,
  getDocumentJSONComments,
  withoutDocumentJSONComments,
} from "@app/components/editor/document/DocumentComments";
import { buildLiveDocumentExtensions } from "@app/components/editor/document/liveExtensions";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { FIXTURE } from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import { Err } from "@app/types/shared/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

/** The shared document as the server builds it from the file: the body, no threads. */
function sharedDocumentFor(source: string) {
  const loaded = loadDfm(source);
  if (loaded.isErr()) {
    throw new Error(loaded.error);
  }
  const document = new Y.Doc();
  prosemirrorJSONToYXmlFragment(
    documentSchema,
    withoutDocumentJSONComments(loaded.value.content),
    document.getXmlFragment(BODY_FRAGMENT_NAME)
  );
  return {
    document,
    commentIds: getMarkedCommentIds(loaded.value.content),
    fileThreads: getDocumentJSONComments(loaded.value.content),
  };
}

const SESSION_THREADS: DfmComment[] = [
  {
    id: "c-live",
    status: "resolved",
    messages: [
      {
        author: { kind: "user", id: "usr_daph", name: "Daph" },
        createdAt: "2026-01-01T00:00:00.000Z",
        body: "From the session.",
      },
    ],
  },
];

/** A session's comment side, whose thread pushes the test makes. */
function fakeCommentChannel() {
  const listeners = new Set<(comments: DfmComment[]) => void>();
  let threads: DfmComment[] | null = null;
  const channel: LiveCommentChannel = {
    getThreads: () => threads,
    onThreads: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: async () => new Err("unavailable"),
    close: () => {
      threads = null;
      listeners.clear();
    },
  };
  const push = (comments: DfmComment[]) => {
    threads = comments;
    listeners.forEach((listener) => listener(comments));
  };
  return { channel, push };
}

function renderLiveEditor(
  document: Y.Doc,
  {
    onSave = vi.fn(),
    initialContent = FIXTURE,
    comments = fakeCommentChannel().channel,
  } = {}
) {
  return renderHook(() =>
    useDocumentEditor({
      initialContent,
      readOnly: false,
      autosaveDebounceMs: 0,
      onSave,
      onStateChange: undefined,
      resolveImageSource: () => null,
      live: {
        extensions: buildLiveDocumentExtensions({
          t: (descriptor) => descriptor.id ?? "",
          document,
          awareness: null,
          user: { name: "Daph", color: "#0ea5e9" },
          comments,
          resolveImageSource: () => null,
        }),
        connected: true,
      },
    })
  );
}

/** A second client: a copy of the shared document, whose edits flow back into it. */
function remoteEdit(document: Y.Doc, text: string) {
  const remote = new Y.Doc();
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(document));
  const paragraph = remote
    .getXmlFragment(BODY_FRAGMENT_NAME)
    .toArray()
    .find(
      (node): node is Y.XmlElement =>
        node instanceof Y.XmlElement && node.nodeName === "paragraph"
    );
  const firstText = paragraph?.toArray()[0];
  if (!(firstText instanceof Y.XmlText)) {
    throw new Error("No paragraph text in the fixture.");
  }
  firstText.insert(0, text);
  Y.applyUpdate(
    document,
    Y.encodeStateAsUpdate(remote, Y.encodeStateVector(document))
  );
}

describe("useDocumentEditor in a live session", () => {
  it("shows the shared body and keeps every comment anchor", async () => {
    const { document, commentIds } = sharedDocumentFor(FIXTURE);
    expect(commentIds.size).toBeGreaterThan(0);

    const { result } = renderLiveEditor(document);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor;
    if (!editor) {
      return;
    }

    expect(getMarkedCommentIds(editor.getJSON())).toEqual(commentIds);
    expect(result.current.editable).toBe(true);
  });

  it("shows the file's threads until the session sends its own", async () => {
    const { document, fileThreads } = sharedDocumentFor(FIXTURE);
    expect(fileThreads.length).toBeGreaterThan(0);

    const { result } = renderLiveEditor(document);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor;
    if (!editor) {
      return;
    }

    expect(getDocumentComments(editor.state.doc)).toEqual(fileThreads);
  });

  // Checked right after construction: TipTap emits `create` a tick later, which a `waitFor`
  // would let run first.
  it("shows the threads the session sent before the editor existed, from its mount", () => {
    const { document } = sharedDocumentFor(FIXTURE);
    const { channel, push } = fakeCommentChannel();
    push(SESSION_THREADS);

    const editor = new Editor({
      extensions: buildLiveDocumentExtensions({
        t: (descriptor) => descriptor.id ?? "",
        document,
        awareness: null,
        user: { name: "Daph", color: "#0ea5e9" },
        comments: channel,
        resolveImageSource: () => null,
      }),
    });

    try {
      expect(getDocumentComments(editor.state.doc)).toEqual(SESSION_THREADS);
    } finally {
      editor.destroy();
    }
  });

  it("shows the threads the session sends, without touching the shared document", async () => {
    const { document } = sharedDocumentFor(FIXTURE);
    const { channel, push } = fakeCommentChannel();
    const { result } = renderLiveEditor(document, { comments: channel });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor;
    if (!editor) {
      return;
    }
    const before = Y.encodeStateVector(document);

    act(() => push(SESSION_THREADS));

    expect(getDocumentComments(editor.state.doc)).toEqual(SESSION_THREADS);
    expect(Y.encodeStateVector(document)).toEqual(before);
  });

  it("shows the session's last threads in an editor mounted once the channel has closed", () => {
    const { document } = sharedDocumentFor(FIXTURE);
    const { channel, push } = fakeCommentChannel();
    const extensions = buildLiveDocumentExtensions({
      t: (descriptor) => descriptor.id ?? "",
      document,
      awareness: null,
      user: { name: "Daph", color: "#0ea5e9" },
      comments: channel,
      resolveImageSource: () => null,
    });
    const lost = new Editor({ extensions });
    push(SESSION_THREADS);
    channel.close();
    lost.destroy();

    const remounted = new Editor({ extensions });

    try {
      expect(channel.getThreads()).toBeNull();
      expect(getDocumentComments(remounted.state.doc)).toEqual(SESSION_THREADS);
    } finally {
      remounted.destroy();
    }
  });

  it("leaves the document untouched when the session sends the threads it shows", async () => {
    const { document, fileThreads } = sharedDocumentFor(FIXTURE);
    const { channel, push } = fakeCommentChannel();
    const { result } = renderLiveEditor(document, { comments: channel });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor;
    if (!editor) {
      return;
    }
    const transactions = vi.fn();
    editor.on("transaction", transactions);

    act(() => push(structuredClone(fileThreads)));
    act(() => push(SESSION_THREADS));
    act(() => push(structuredClone(SESSION_THREADS)));

    expect(transactions).toHaveBeenCalledTimes(1);
    expect(getDocumentComments(editor.state.doc)).toEqual(SESSION_THREADS);
  });

  it("keeps the anchors through a remote edit, in the editor and the shared document", async () => {
    const { document, commentIds } = sharedDocumentFor(FIXTURE);
    const { result } = renderLiveEditor(document);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor;
    if (!editor) {
      return;
    }

    act(() => remoteEdit(document, "From another client. "));

    expect(editor.getText()).toContain("From another client.");
    expect(getMarkedCommentIds(editor.getJSON())).toEqual(commentIds);
    for (const id of commentIds) {
      expect(document.getXmlFragment(BODY_FRAGMENT_NAME).toString()).toContain(
        id
      );
    }
  });

  it("keeps anchors whose thread the fetched file does not have", async () => {
    // A stale fetch: the file had no comments yet when it was read.
    const { document, commentIds } = sharedDocumentFor(FIXTURE);
    const { result } = renderLiveEditor(document, {
      initialContent: "# Pencil case manifesto\n",
    });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor;
    if (!editor) {
      return;
    }

    act(() => {
      editor.commands.insertContentAt(1, "Mine. ");
    });
    act(() => remoteEdit(document, "Theirs. "));

    expect(getMarkedCommentIds(editor.getJSON())).toEqual(commentIds);
    for (const id of commentIds) {
      expect(document.getXmlFragment(BODY_FRAGMENT_NAME).toString()).toContain(
        id
      );
    }
  });

  describe("with a comment whose thread the fetched file does not have", () => {
    const TAGGED = `Hi :comment-start{id=c1}run all tests:comment-end{id=c1} now\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=2026-01-01T00:00:00.000Z}\n\nNote.\n:::\n`;

    async function renderStaleEditor() {
      const { document } = sharedDocumentFor(TAGGED);
      const { result } = renderLiveEditor(document, {
        initialContent: "Hi run all tests now\n",
      });
      await waitFor(() => expect(result.current.editor).not.toBeNull());
      const editor = result.current.editor;
      if (!editor) {
        throw new Error("Editor did not mount.");
      }
      return editor;
    }

    function commentedText(node: ProseMirrorNode, id: string) {
      let text = "";
      node.descendants((child) => {
        if (child.marks.some((mark) => mark.attrs.id === id)) {
          text += child.text ?? "";
        }
      });
      return text;
    }

    it("refuses inline code over its edge", async () => {
      const editor = await renderStaleEditor();
      const before = editor.state.doc;

      act(() => {
        editor
          .chain()
          .setTextSelection({ from: 12, to: 17 })
          .toggleCode()
          .run();
      });

      expect(editor.state.doc.eq(before)).toBe(true);
    });

    it("loses its marks, in the shared document too, when they are removed", async () => {
      const { document } = sharedDocumentFor(TAGGED);
      const { result } = renderLiveEditor(document, {
        initialContent: "Hi run all tests now\n",
      });
      await waitFor(() => expect(result.current.editor).not.toBeNull());
      const editor = result.current.editor;
      if (!editor) {
        return;
      }

      act(() => {
        editor.commands.removeCommentMarks("c1");
      });

      expect(getMarkedCommentIds(editor.getJSON()).size).toBe(0);
      expect(
        document.getXmlFragment(BODY_FRAGMENT_NAME).toString()
      ).not.toContain("c1");
    });

    it("loses its marks in another editor of the session when one removes them", async () => {
      const { document } = sharedDocumentFor(TAGGED);
      const editors = [0, 1].map(
        () =>
          renderLiveEditor(document, {
            initialContent: "Hi run all tests now\n",
          }).result
      );
      await waitFor(() =>
        editors.forEach((result) =>
          expect(result.current.editor).not.toBeNull()
        )
      );
      const [local, remote] = editors.map((result) => result.current.editor);
      if (!local || !remote) {
        return;
      }
      expect(getMarkedCommentIds(remote.getJSON())).toEqual(new Set(["c1"]));

      act(() => {
        local.commands.removeCommentMarks("c1");
      });

      expect(getMarkedCommentIds(remote.getJSON()).size).toBe(0);
    });

    it("marks text pasted inside it", async () => {
      const editor = await renderStaleEditor();

      act(() => {
        editor.commands.insertContentAt(8, {
          type: "text",
          text: "x",
          marks: [{ type: "bold" }],
        });
      });

      expect(commentedText(editor.state.doc, "c1")).toBe("run xall tests");
    });
  });

  it("does not write its empty paragraph into an empty shared document", async () => {
    const { document } = sharedDocumentFor("");
    for (const _ of [1, 2]) {
      const { result } = renderLiveEditor(document, { initialContent: "" });
      await waitFor(() => expect(result.current.editor).not.toBeNull());
    }

    expect(document.getXmlFragment(BODY_FRAGMENT_NAME).length).toBe(0);
  });

  it("undoes only the local edit, and never saves", async () => {
    const { document } = sharedDocumentFor(FIXTURE);
    const onSave = vi.fn();
    const { result } = renderLiveEditor(document, { onSave });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor;
    if (!editor) {
      return;
    }

    act(() => {
      editor.commands.insertContentAt(1, "Mine. ");
    });
    act(() => remoteEdit(document, "Theirs. "));
    act(() => {
      editor.commands.undo();
    });

    expect(editor.getText()).not.toContain("Mine.");
    expect(editor.getText()).toContain("Theirs.");
    await act(async () => {
      await result.current.save();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(result.current.dirty).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });
});
