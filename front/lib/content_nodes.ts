import {
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  DocumentPileIcon,
  FolderIcon,
  Square3Stack3DIcon,
} from "@dust-tt/sparkle";
import type { BaseContentNode } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

function getVisualForFileContentNode(node: BaseContentNode & { type: "file" }) {
  if (node.expandable) {
    return DocumentPileIcon;
  }

  return DocumentIcon;
}

export function getVisualForContentNode(node: BaseContentNode) {
  switch (node.type) {
    case "channel":
      return ChatBubbleLeftRightIcon;

    case "database":
      return Square3Stack3DIcon;

    case "file":
      return getVisualForFileContentNode(
        node as BaseContentNode & { type: "file" }
      );

    case "folder":
      return FolderIcon;

    default:
      assertNever(node.type);
  }
}
