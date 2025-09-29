// Public Api types are okay to use here as it's about internal types between connector and front.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import { SPREADSHEET_INTERNAL_MIME_TYPES } from "@app/lib/content_nodes";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type {
  ContentNodesViewType,
  ContentNodeWithParent,
  CoreAPIContentNode,
  DataSourceViewType,
} from "@app/types";
import { assertNever } from "@app/types";

const NON_EXPANDABLE_NODES_MIME_TYPES = [
  INTERNAL_MIME_TYPES.GITHUB.DISCUSSIONS,
  INTERNAL_MIME_TYPES.GITHUB.ISSUES,
  INTERNAL_MIME_TYPES.INTERCOM.TEAM,
  INTERNAL_MIME_TYPES.SLACK.CHANNEL,
] as readonly string[];

export const NON_SEARCHABLE_NODES_MIME_TYPES = [
  INTERNAL_MIME_TYPES.GITHUB.DISCUSSION,
  INTERNAL_MIME_TYPES.GITHUB.ISSUE,
  INTERNAL_MIME_TYPES.INTERCOM.CONVERSATION,
  INTERNAL_MIME_TYPES.SLACK.MESSAGES,
  INTERNAL_MIME_TYPES.SLACK.THREAD,
] as readonly string[];

export const FOLDERS_TO_HIDE_IF_EMPTY_MIME_TYPES = [
  INTERNAL_MIME_TYPES.NOTION.UNKNOWN_FOLDER,
  INTERNAL_MIME_TYPES.NOTION.SYNCING_FOLDER,
  INTERNAL_MIME_TYPES.GOOGLE_DRIVE.SHARED_WITH_ME,
  INTERNAL_MIME_TYPES.GITHUB.DISCUSSIONS,
  INTERNAL_MIME_TYPES.GITHUB.ISSUES,
] as readonly string[];

const FOLDERS_SELECTION_PREVENTED_MIME_TYPES = [
  INTERNAL_MIME_TYPES.NOTION.SYNCING_FOLDER,
] as readonly string[];

export const UNTITLED_TITLE = "Untitled Document";

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
    case "slack_bot":
    case "zendesk":
    case "webcrawler":
    case "gong":
      throw new Error(
        `Provider ${dataSource.connectorProvider} is not supported`
      );

    default:
      assertNever(dataSource.connectorProvider);
  }
}

function isExpandable(
  node: CoreAPIContentNode,
  viewType: ContentNodesViewType
) {
  return (
    !NON_EXPANDABLE_NODES_MIME_TYPES.includes(node.mime_type) &&
    node.children_count > 0 &&
    // if we aren't in tables/data_warehouse/all view, spreadsheets are not expandable
    !(
      !["table", "data_warehouse", "all"].includes(viewType) &&
      SPREADSHEET_INTERNAL_MIME_TYPES.includes(node.mime_type)
    )
  );
}

export function getContentNodeFromCoreNode(
  coreNode: CoreAPIContentNode,
  viewType: ContentNodesViewType
): ContentNodeWithParent {
  return {
    internalId: coreNode.node_id,
    parentInternalId: coreNode.parent_id ?? null,
    // TODO(2025-01-27 aubin): remove this once the corresponding titles are backfilled.
    title:
      coreNode.title === UNTITLED_TITLE ? coreNode.node_id : coreNode.title,
    sourceUrl: coreNode.source_url ?? null,
    permission: "read",
    lastUpdatedAt: coreNode.timestamp,
    providerVisibility: coreNode.provider_visibility,
    parentInternalIds: coreNode.parents,
    type: coreNode.node_type,
    expandable: isExpandable(coreNode, viewType),
    mimeType: coreNode.mime_type,
    preventSelection:
      // In data_warehouse view, all nodes are selectable (databases, schemas, tables)
      viewType === "data_warehouse"
        ? false
        : FOLDERS_SELECTION_PREVENTED_MIME_TYPES.includes(coreNode.mime_type) ||
          (viewType === "table" && coreNode.node_type !== "table"),
    parentTitle: coreNode.parent_title,
  };
}
