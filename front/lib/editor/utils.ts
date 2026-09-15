import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * Returns whether the editor document contains a node matching the predicate.
 *
 * Used to keep attachment state in sync with inline nodes: when an inline node is
 * deleted, its attachment is only detached if no other node referencing the same
 * attachment remains in the document.
 */
export function hasMatchingNode(
  editor: Editor,
  predicate: (node: ProseMirrorNode) => boolean
): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (found) {
      return false;
    }
    if (predicate(node)) {
      found = true;
    }
    return true;
  });
  return found;
}
