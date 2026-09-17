import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// You can inline tools/knowledge/skills as many times as you want, so we will not remove the reference if there is another reference
export function hasAnotherAttachedNode(
  doc: ProseMirrorNode,
  isSameAttachment: (node: ProseMirrorNode) => boolean
): boolean {
  let found = false;
  // this comes from prose mirror and you cannot stop the loop in the middle
  doc.descendants((node) => {
    if (found) {
      return false;
    }
    if (isSameAttachment(node)) {
      found = true;
    }
    return true;
  });
  return found;
}
