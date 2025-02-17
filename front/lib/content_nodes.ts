import {
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  DocumentPileIcon,
  FolderIcon,
  FolderTableIcon,
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

// Mime types that should be represented with a Spreadsheet icon, despite being of type "folder".
export const SPREADSHEET_MIME_TYPES = [
  MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET,
  MIME_TYPES.MICROSOFT.SPREADSHEET,
] as readonly string[];

function getVisualForFileContentNode(node: ContentNode & { type: "file" }) {
  if (node.expandable) {
    return DocumentPileIcon;
  }

  return DocumentIcon;
}

export function getVisualForContentNode(node: ContentNode) {
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
  if (SPREADSHEET_MIME_TYPES.includes(node.mimeType)) {
    return FolderTableIcon;
  }
  switch (node.type) {
    case "database":
      return Square3Stack3DIcon;
    case "folder":
      return FolderIcon;
    case "file":
      return getVisualForFileContentNode(
        node as ContentNode & { type: "file" }
      );
    default:
      assertNever(node.type);
  }
}
