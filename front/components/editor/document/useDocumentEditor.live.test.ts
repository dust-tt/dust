import { documentSchema } from "@app/components/editor/document/content";
import { loadDfm } from "@app/components/editor/document/dfm_persistence";
import { getMarkedCommentIds } from "@app/components/editor/document/DocumentCommentAnchor";
import { withoutDocumentJSONComments } from "@app/components/editor/document/DocumentComments";
import { buildLiveDocumentExtensions } from "@app/components/editor/document/liveExtensions";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { FIXTURE } from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import { act, renderHook, waitFor } from "@testing-library/react";
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
  return { document, commentIds: getMarkedCommentIds(loaded.value.content) };
}

function renderLiveEditor(
  document: Y.Doc,
  { onSave = vi.fn(), initialContent = FIXTURE } = {}
) {
  return renderHook(() =>
    useDocumentEditor({
      initialContent,
      readOnly: false,
      autosaveDebounceMs: 0,
      onSave,
      onStateChange: undefined,
      live: {
        extensions: buildLiveDocumentExtensions({
          t: (descriptor) => descriptor.id ?? "",
          document,
          awareness: null,
          user: { name: "Daph", color: "#0ea5e9" },
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
