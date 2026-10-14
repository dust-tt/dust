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

const joinListsAroundEmptyParagraph = (
  editor: Editor,
  direction: "backward" | "forward"
) => {
  const { selection } = editor.state;
  const { $from } = selection;
  const paragraph = $from.parent;
  if (
    !selection.empty ||
    paragraph.type.name !== "paragraph" ||
    paragraph.content.size > 0 ||
    $from.depth < 1
  ) {
    return false;
  }

  const container = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  if (index === 0 || index === container.childCount - 1) {
    return false;
  }

  const before = container.child(index - 1);
  const after = container.child(index + 1);
  const { extensions } = editor.extensionManager;
  if (!isList(before.type.name, extensions) || !canJoinLists(before, after)) {
    return false;
  }

  const paragraphPos = $from.before();
  const { tr } = editor.state;
  tr.delete(paragraphPos, paragraphPos + paragraph.nodeSize);
  tr.join(paragraphPos);
  // The join leaves `paragraphPos - 1` between the first list's last item and the second's first.
  tr.setSelection(
    Selection.near(
      tr.doc.resolve(paragraphPos - 1),
      direction === "backward" ? -1 : 1
    )
  );
  editor.view.dispatch(tr.scrollIntoView());
  return true;
};

// TODO(louisjc): remove when TipTap joins the lists itself, ueberdosis/tiptap#8434.
/**
 * @cc [owner:louisjc,label:product] join-lists-around-empty-paragraph
 * Backspace or Delete with the caret in an empty paragraph whose previous and next siblings are
 * lists of the same node type and numbering `type` MUST remove the paragraph and join the two
 * lists into one, in a single transaction, so numbering continues and one undo restores both
 * lists. Lists of different types, or any other caret position, MUST keep TipTap's behavior.
 */
export const DocumentListJoin = Extension.create({
  name: "documentListJoin",
  priority: DOCUMENT_LIST_JOIN_PRIORITY,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) =>
        joinListsAroundEmptyParagraph(editor, "backward"),
      Delete: ({ editor }) => joinListsAroundEmptyParagraph(editor, "forward"),
    };
  },
});
