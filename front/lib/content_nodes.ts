import {
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  DocumentPileIcon,
  FolderIcon,
  LockIcon,
  Square3Stack3DIcon,
} from "@dust-tt/sparkle";
import type { ContentNode } from "@dust-tt/types";
import { assertNever, MIME_TYPES } from "@dust-tt/types";

// Mime types that should be represented with a Channel icon.
export const CHANNEL_MIME_TYPES = [
  MIME_TYPES.GITHUB.DISCUSSIONS,
  MIME_TYPES.INTERCOM.TEAM,
  MIME_TYPES.INTERCOM.TEAMS_FOLDER,
  MIME_TYPES.SLACK.CHANNEL,
] as readonly string[];

// Mime types that should be represented with a Database icon but are not of type "table".
export const DATABASE_MIME_TYPES = [
  MIME_TYPES.GITHUB.ISSUES,
] as readonly string[];

// Mime types that should be represented with a File icon but are not of type "document".
export const FILE_MIME_TYPES = [
  MIME_TYPES.WEBCRAWLER.FOLDER,
] as readonly string[];

function getVisualForFileContentNode(node: ContentNode & { type: "file" }) {
  if (node.expandable) {
    return DocumentPileIcon;
  }

  return DocumentIcon;
}

export function getVisualForContentNode(
  node: ContentNode,
  useMimeType = false
) {
  if (useMimeType) {
    return getVisualForContentNodeBasedOnMimeType(node);
  } else {
    return getVisualForContentNodeBasedOnType(node);
  }
}

function getVisualForContentNodeBasedOnType(node: ContentNode) {
  switch (node.type) {
    case "channel":
      if (node.providerVisibility === "private") {
        return LockIcon;
      }
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

function getVisualForContentNodeBasedOnMimeType(node: ContentNode) {
  if (!node.mimeType) {
    throw new Error(
      "Unreachable: getVisualForContentNodeBasedOnMimeType called on a node that does not have a mime type"
    );
  }
  if (CHANNEL_MIME_TYPES.includes(node.mimeType)) {
    if (node.providerVisibility === "private") {
      return LockIcon;
    }
    return ChatBubbleLeftRightIcon;
  }
  if (DATABASE_MIME_TYPES.includes(node.mimeType)) {
    return Square3Stack3DIcon;
  }
  if (FILE_MIME_TYPES.includes(node.mimeType)) {
    return getVisualForFileContentNode(node as ContentNode & { type: "file" });
  }
  switch (node.type) {
    case "database":
      return Square3Stack3DIcon;
    case "folder":
      return FolderIcon;
    // TODO(2025-01-24 aubin) once we remove the "channel" type, change this to case "file" and add an assertNever
    default:
      return getVisualForFileContentNode(
        node as ContentNode & { type: "file" }
      );
  }
}
