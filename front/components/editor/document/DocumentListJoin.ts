import type { Editor } from "@tiptap/core";
import { Extension, isList } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";

// TipTap's ListKeymap binds Backspace and Delete at the default priority, 100.
const DOCUMENT_LIST_JOIN_PRIORITY = 101;

// A missing numbering `type` means decimal, as in TipTap's `toggleList`.
const canJoinLists = (before: Node, after: Node) =>
  before.type === after.type &&
  (before.attrs.type ?? "1") === (after.attrs.type ?? "1");

// `bias` places the caret at the end of the first list (-1) or the start of the second (1).
const joinListsAroundEmptyParagraph = (editor: Editor, bias: -1 | 1) => {
  const { selection, tr } = editor.state;
  const { $from } = selection;
  const paragraph = $from.parent;
  if (
    !selection.empty ||
    paragraph.type.name !== "paragraph" ||
    paragraph.content.size > 0
  ) {
    return false;
  }

  const container = $from.node(-1);
  const before = container.maybeChild($from.index(-1) - 1);
  const after = container.maybeChild($from.index(-1) + 1);
  if (
    !before ||
    !after ||
    !isList(before.type.name, editor.extensionManager.extensions) ||
    !canJoinLists(before, after)
  ) {
    return false;
  }

  const paragraphPos = $from.before();
  tr.delete(paragraphPos, paragraphPos + paragraph.nodeSize).join(paragraphPos);
  // The join leaves `paragraphPos - 1` between the first list's last item and the second's first.
  tr.setSelection(Selection.near(tr.doc.resolve(paragraphPos - 1), bias));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
};

// Backspace or Delete in an empty paragraph between two lists of the same type joins them, so
// numbering continues.
// TODO(louisjc): remove when TipTap joins the lists itself, ueberdosis/tiptap#8434.
export const DocumentListJoin = Extension.create({
  name: "documentListJoin",
  priority: DOCUMENT_LIST_JOIN_PRIORITY,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => joinListsAroundEmptyParagraph(editor, -1),
      Delete: ({ editor }) => joinListsAroundEmptyParagraph(editor, 1),
    };
  },
});
