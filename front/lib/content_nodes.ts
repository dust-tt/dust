import {
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  DocumentPileIcon,
  FolderIcon,
  Square3Stack3DIcon,
} from "@dust-tt/sparkle";
import type { ContentNode } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

function getVisualForFileContentNode(node: ContentNode & { type: "file" }) {
  if (node.expandable) {
    return DocumentPileIcon;
  }

  return DocumentIcon;
}

export function getVisualForContentNode(node: ContentNode) {
  switch (node.type) {
    case "channel":
      return ChatBubbleLeftRightIcon;

    case "database":
      return Square3Stack3DIcon;

    case "file":
      return getVisualForFileContentNode(
        node as ContentNode & { type: "file" }
      );

    case "folder":
      return FolderIcon;

    default:
      assertNever(node.type);
  }
}
