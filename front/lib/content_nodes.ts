import {
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  DocumentPileIcon,
  FolderIcon,
  FolderTableIcon,
  LockIcon,
  Square3Stack3DIcon,
} from "@dust-tt/sparkle";
import type { ContentNode, DataSourceViewContentNode } from "@dust-tt/types";
import { assertNever, MIME_TYPES } from "@dust-tt/types";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

// Since titles will be synced in ES we don't support arbitrarily large titles.
export const MAX_NODE_TITLE_LENGTH = 512;

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

// Mime types that represent a datasource.
export const DATA_SOURCE_MIME_TYPES = [
  "application/vnd.dust.datasource",
] as readonly string[];

function getVisualForFileContentNode(node: ContentNode & { type: "document" }) {
  if (node.expandable) {
    return DocumentPileIcon;
  }

  return DocumentIcon;
}

export function getVisualForDataSourceViewContentNode(
  node: DataSourceViewContentNode
) {
  // Handle data sources with connector providers
  if (
    node.mimeType &&
    DATA_SOURCE_MIME_TYPES.includes(node.mimeType) &&
    node.dataSourceView?.dataSource?.connectorProvider &&
    CONNECTOR_CONFIGURATIONS[node.dataSourceView.dataSource.connectorProvider]
  ) {
    return CONNECTOR_CONFIGURATIONS[
      node.dataSourceView.dataSource.connectorProvider
    ].getLogoComponent();
  }

  // Fall back to regular content node icon handling.
  return getVisualForContentNode(node);
}

export function getVisualForContentNode(node: ContentNode) {
  // Check mime type first for special icon handling.
  if (node.mimeType) {
    // Handle private channels with lock icon.
    if (CHANNEL_MIME_TYPES.includes(node.mimeType)) {
      return node.providerVisibility === "private"
        ? LockIcon
        : ChatBubbleLeftRightIcon;
    }

    // Handle database-like content.
    if (DATABASE_MIME_TYPES.includes(node.mimeType)) {
      return Square3Stack3DIcon;
    }

    // Handle file-like content that isn't a document type.
    if (FILE_MIME_TYPES.includes(node.mimeType)) {
      return getVisualForFileContentNode(
        node as ContentNode & { type: "document" }
      );
    }

    // Handle spreadsheets.
    if (SPREADSHEET_MIME_TYPES.includes(node.mimeType)) {
      return FolderTableIcon;
    }
  }

  // Fall back to node type if mime type doesn't determine the icon.
  switch (node.type) {
    case "table":
      return Square3Stack3DIcon;

    case "folder":
      return FolderIcon;

    case "document":
      return getVisualForFileContentNode(
        node as ContentNode & { type: "document" }
      );

    default:
      assertNever(node.type);
  }
}
