import type {
  ContentNodeType,
  CoreAPIContentNode,
  DataSourceViewType,
} from "@dust-tt/types";
import { assertNever, MIME_TYPES } from "@dust-tt/types";

import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

export const NON_EXPANDABLE_NODES_MIME_TYPES = [
  MIME_TYPES.SLACK.CHANNEL,
  MIME_TYPES.GITHUB.DISCUSSIONS,
  MIME_TYPES.GITHUB.ISSUES,
  MIME_TYPES.INTERCOM.TEAM,
  MIME_TYPES.ZENDESK.TICKETS,
] as readonly string[];

export const FOLDERS_TO_HIDE_IF_EMPTY_MIME_TYPES = [
  MIME_TYPES.NOTION.UNKNOWN_FOLDER,
  MIME_TYPES.NOTION.SYNCING_FOLDER,
  MIME_TYPES.GOOGLE_DRIVE.SHARED_WITH_ME,
  MIME_TYPES.GITHUB.DISCUSSIONS,
  MIME_TYPES.GITHUB.ISSUES,
] as readonly string[];

export const FOLDERS_SELECTION_PREVENTED_MIME_TYPES = [
  MIME_TYPES.NOTION.SYNCING_FOLDER,
] as readonly string[];

export function getContentNodeInternalIdFromTableId(
  dataSourceView: DataSourceViewResource | DataSourceViewType,
  tableId: string
): string {
  const { dataSource } = dataSourceView;

  switch (dataSource.connectorProvider) {
    case null:
    case "microsoft":
    case "snowflake":
    case "google_drive":
    case "notion":
    case "bigquery":
    case "salesforce":
      return tableId;

    case "intercom":
    case "confluence":
    case "github":
    case "slack":
    case "zendesk":
    case "webcrawler":
      throw new Error(
        `Provider ${dataSource.connectorProvider} is not supported`
      );

    default:
      assertNever(dataSource.connectorProvider);
  }
}

export function getContentNodeType(node: CoreAPIContentNode): ContentNodeType {
  // this is approximate and will be cleaned up when we turn ContentNodeType into the same nodeType as in core
  // the main point is that it correctly identifies documents as files as this is used in ContentNodeTree
  // TODO(2025-01-27 aubin): clean this up
  switch (node.node_type) {
    case "Table":
      return "database";
    case "Folder":
      return "folder";
    case "Document":
      return "file";
    default:
      assertNever(node.node_type);
  }
}
