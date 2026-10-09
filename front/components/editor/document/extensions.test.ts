import { getMarkedCommentIds } from "@app/components/editor/document/DocumentCommentAnchor";
import { buildDocumentEditorExtensions } from "@app/components/editor/document/extensions";
import type { MessageDescriptor } from "@lingui/core";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

// A comment mark whose thread the editor does not hold, as in a live document.
const ORPHAN_MARK_DOCUMENT = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Commented text",
          marks: [{ type: "comment", attrs: { id: "c1" } }],
        },
      ],
    },
  ],
};

const translate = (descriptor: MessageDescriptor) => descriptor.id ?? "";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function editInsideTheMark(live: boolean) {
  editor = new Editor({
    extensions: buildDocumentEditorExtensions(translate, {
      live,
      resolveImageSource: () => null,
    }),
    content: ORPHAN_MARK_DOCUMENT,
  });
  editor.commands.insertContentAt(3, "x");
  return getMarkedCommentIds(editor.getJSON());
}

describe("buildDocumentExtensions", () => {
  it("drops a comment mark without a thread from a saved document", () => {
    expect(editInsideTheMark(false)).toEqual(new Set());
  });

  it("keeps a comment mark without a thread in a live document", () => {
    expect(editInsideTheMark(true)).toEqual(new Set(["c1"]));
  });

  it("leaves StarterKit's undo history out of a live document", () => {
    const undoRedo = (live: boolean) =>
      buildDocumentEditorExtensions(translate, {
        live,
        resolveImageSource: () => null,
      }).find(({ name }) => name === "starterKit")?.options.undoRedo;

    expect(undoRedo(false)).not.toBe(false);
    expect(undoRedo(true)).toBe(false);
  });
});
