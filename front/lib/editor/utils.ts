import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// You can inline tools/knowledge/skills as many times as you want, so we will not remove the reference if there is another reference
export function hasAnotherAttachedNode(
  editor: Editor,
  predicate: (node: ProseMirrorNode) => boolean
): boolean {
  let found = false;
  // this comes from prose mirror and you cannot stop the loop in the middle
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
