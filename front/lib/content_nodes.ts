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
const CHANNEL_MIME_TYPES = [
  MIME_TYPES.GITHUB.DISCUSSIONS,
  MIME_TYPES.SLACK.CHANNEL,
] as readonly string[];

// Mime types that should be represented with a Database icon.
const DATABASE_MIME_TYPES = [
  MIME_TYPES.GITHUB.ISSUES,
  MIME_TYPES.SNOWFLAKE.TABLE,
] as readonly string[];

// Mime types that should be represented with a Folder icon.
const FOLDER_MIME_TYPES = [
  MIME_TYPES.CONFLUENCE.SPACE,
  MIME_TYPES.GOOGLE_DRIVE.FOLDER,
  MIME_TYPES.INTERCOM.TEAM,
  MIME_TYPES.MICROSOFT.FOLDER,
  MIME_TYPES.NOTION.UNKNOWN_FOLDER,
  MIME_TYPES.SNOWFLAKE.DATABASE,
  MIME_TYPES.SNOWFLAKE.SCHEMA,
  MIME_TYPES.WEBCRAWLER.FOLDER,
  MIME_TYPES.ZENDESK.BRAND,
  MIME_TYPES.ZENDESK.HELP_CENTER,
  MIME_TYPES.ZENDESK.CATEGORY,
  MIME_TYPES.ZENDESK.TICKETS,
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
    return getVisualForContentNodeBaseOnType(node);
  }
}

function getVisualForContentNodeBaseOnType(node: ContentNode) {
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
    // putting a default value here to please TS,
    // but mimeType should always be defined in a world where we get it from core (currently kept for retro-compatibility with connectors' /content_nodes endpoints)
    return getVisualForFileContentNode(node as ContentNode & { type: "file" });
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
  if (FOLDER_MIME_TYPES.includes(node.mimeType)) {
    return FolderIcon;
  }
  // TODO(2025-01-17 aubin): we have an issue here in that depending on the view type we sometimes want to render "text/csv" as databases or as files
  return getVisualForFileContentNode(node as ContentNode & { type: "file" });
}
