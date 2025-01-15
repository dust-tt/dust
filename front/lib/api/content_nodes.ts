import type {
  ContentNodeType,
  CoreAPIContentNode,
  DataSourceViewType,
} from "@dust-tt/types";
import {
  assertNever,
  getGoogleSheetContentNodeInternalIdFromTableId,
  getMicrosoftSheetContentNodeInternalIdFromTableId,
  getNotionDatabaseContentNodeInternalIdFromTableId,
  MIME_TYPES,
} from "@dust-tt/types";

import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

export function getContentNodeInternalIdFromTableId(
  dataSourceView: DataSourceViewResource | DataSourceViewType,
  tableId: string
): string {
  const { dataSource } = dataSourceView;

  switch (dataSource.connectorProvider) {
    case "google_drive":
      return getGoogleSheetContentNodeInternalIdFromTableId(tableId);

    case "notion":
      return getNotionDatabaseContentNodeInternalIdFromTableId(tableId);

    case "microsoft":
      return getMicrosoftSheetContentNodeInternalIdFromTableId(tableId);

    // For static and snowflake tables, the contentNode internalId is the tableId.
    case null:
    case "snowflake":
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

export function getContentNodeMetadata(
  node: CoreAPIContentNode,
  viewType: "tables" | "documents"
): {
  type: ContentNodeType;
  expandable: boolean;
  preventSelection?: boolean;
} {
  // TODO(2025-01-15 aubin) - remove the dev comments
  // unless mentioned otherwise, the following is taken from retrieveBatchContentNodes in each connector's index.ts
  switch (node.mime_type) {
    case MIME_TYPES.CONFLUENCE.PAGE: // taken from createContentNodeFromPage
      return {
        type: "file",
        expandable: node.has_children, // this should match checkPageHasChildren in confluence/lib/permissions.ts, which does a check in db
      };
    case MIME_TYPES.CONFLUENCE.SPACE: // taken from createContentNodeFromSpace
      return {
        type: "folder",
        expandable: true, // isExpandable set to false only in getPermissions with permissions = none (which we won't replace)
      };
    case MIME_TYPES.GITHUB.REPOSITORY:
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.GITHUB.CODE_ROOT:
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.GITHUB.CODE_DIRECTORY:
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.GITHUB.CODE_FILE:
      return {
        type: "file",
        expandable: false,
      };
    case MIME_TYPES.GITHUB.ISSUES:
      return {
        type: "database",
        expandable: false, // surprising
      };
    case MIME_TYPES.GITHUB.ISSUE:
      return {
        type: "file",
        expandable: false,
      };
    case MIME_TYPES.GITHUB.DISCUSSIONS:
      return {
        type: "channel",
        expandable: false, // surprising
      };
    case MIME_TYPES.GITHUB.DISCUSSION:
      return {
        type: "file",
        expandable: false,
      };
    case MIME_TYPES.GOOGLE_DRIVE.FOLDER: // see isDriveObjectExpandable
      return {
        type: "folder",
        expandable: node.has_children, // tricky since it's actually false if the node only has directories as descendants
      };
    case MIME_TYPES.INTERCOM.COLLECTION:
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.INTERCOM.TEAMS_FOLDER:
      return {
        type: "channel",
        expandable: true,
      };
    case MIME_TYPES.INTERCOM.CONVERSATION:
      return {
        type: "file",
        expandable: false,
      };
    case MIME_TYPES.INTERCOM.TEAM:
      return {
        type: "folder", // actually set to "channel" in retrieveBatchContentNodes, but folder in retrievePermissions, have to check with the author
        expandable: false,
      };
    case MIME_TYPES.INTERCOM.HELP_CENTER:
      return {
        type: "database",
        expandable: true,
      };
    case MIME_TYPES.INTERCOM.ARTICLE:
      return {
        type: "file",
        expandable: false,
      };
    case MIME_TYPES.MICROSOFT.FOLDER: // see getMicrosoftNodeAsContentNode
      return {
        type: "folder",
        expandable: true,
      };
    // we have to do something for other microsoft objects, there is some logic in getMicrosoftNodeAsContentNode
    case MIME_TYPES.NOTION.UNKNOWN_FOLDER:
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.NOTION.DATABASE:
      return {
        type: "database",
        expandable: true,
      };
    case MIME_TYPES.NOTION.PAGE:
      return {
        type: "file",
        expandable: node.has_children, // hoping that this matches the output of hasChildren in notion/lib/parents.ts
      };
    case MIME_TYPES.SLACK.CHANNEL:
      return {
        type: "channel",
        expandable: false, // surprising
      };
    case MIME_TYPES.SLACK.THREAD: // these are never showed, not implement in retrieveBatchContentNodes
      return {
        type: "file",
        expandable: false,
      };
    case MIME_TYPES.SLACK.MESSAGES: // these are never showed, not implement in retrieveBatchContentNodes
      return {
        type: "file",
        expandable: true,
      };
    case MIME_TYPES.SNOWFLAKE.DATABASE: // see getContentNodeFromInternalId in snowflake/lib/content_nodes.ts
      return {
        type: "folder",
        expandable: true,
        preventSelection: false,
      };
    case MIME_TYPES.SNOWFLAKE.SCHEMA: // see getContentNodeFromInternalId in snowflake/lib/content_nodes.ts
      return {
        type: "folder",
        expandable: true,
        preventSelection: false,
      };
    case MIME_TYPES.SNOWFLAKE.TABLE: // see getContentNodeFromInternalId in snowflake/lib/content_nodes.ts
      return {
        type: "database",
        expandable: false,
        preventSelection: false,
      };
    case MIME_TYPES.WEBCRAWLER.FOLDER:
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.ZENDESK.BRAND: // see toContentNode method in zendesk_resources.ts
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.ZENDESK.HELP_CENTER: // see toContentNode method in zendesk_resources.ts
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.ZENDESK.CATEGORY: // see toContentNode method in zendesk_resources.ts
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.ZENDESK.ARTICLE: // see toContentNode method in zendesk_resources.ts
      return {
        type: "file",
        expandable: false,
      };
    case MIME_TYPES.ZENDESK.TICKETS: // see toContentNode method in zendesk_resources.ts
      return {
        type: "folder",
        expandable: true,
      };
    case MIME_TYPES.ZENDESK.TICKET: // see toContentNode method in zendesk_resources.ts
      return {
        type: "file",
        expandable: false,
      };
    // handling google drive and microsoft files
    default:
      // the default match Google Drive
      let expandable = false;
      let type: ContentNodeType = "file";
      if (
        node.mime_type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
        viewType === "tables"
      ) {
        expandable = true;
      }
      if (node.mime_type === "text/csv") {
        type = viewType === "tables" ? "database" : "file";
      }
      return {
        type,
        expandable,
      };
  }
}
