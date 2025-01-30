import type {
  ConnectorProvider,
  ContentNodeType,
  CoreAPIContentNode,
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@dust-tt/types";
import { assertNever, MIME_TYPES } from "@dust-tt/types";

import {
  CHANNEL_MIME_TYPES,
  DATABASE_MIME_TYPES,
  FILE_MIME_TYPES,
} from "@app/lib/content_nodes";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type logger from "@app/logger/logger";

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

export function computeNodesDiff({
  connectorsContentNodes,
  coreContentNodes,
  provider,
  localLogger,
}: {
  connectorsContentNodes: DataSourceViewContentNode[];
  coreContentNodes: DataSourceViewContentNode[];
  provider: ConnectorProvider | null;
  localLogger: typeof logger;
}) {
  const missingInternalIds: string[] = [];
  connectorsContentNodes.forEach((connectorsNode) => {
    const coreNodes = coreContentNodes.filter(
      (coreNode) => coreNode.internalId === connectorsNode.internalId
    );
    if (coreNodes.length === 0) {
      // Connector's notion unknown folder can map to core's syncing OR unknown folder.
      // See https://github.com/dust-tt/dust/issues/10340
      if (connectorsNode.internalId !== "notion-unknown") {
        missingInternalIds.push(connectorsNode.internalId);
      }
    } else if (coreNodes.length > 1) {
      // this one should never ever happen, it's a real red flag
      localLogger.info(
        {
          internalId: connectorsNode.internalId,
          coreNodesId: coreNodes.map((n) => n.internalId),
        },
        "[CoreNodes] Found more than one match"
      );
    } else {
      const coreNode = coreNodes[0];
      const diff = Object.fromEntries(
        Object.entries(connectorsNode)
          .filter(([key, value]) => {
            if (
              ["preventSelection", "lastUpdatedAt", "permission"].includes(key)
            ) {
              return false;
            }
            // Custom exclusion rules. The goal here is to avoid logging irrelevant differences, scoping by connector.
            // For Snowflake and Zendesk we fixed how parents were computed in the core folders but not in connectors.
            // For Intercom we keep the virtual node Help Center in connectors but not in core.
            if (
              ["parentInternalIds", "parentInternalId"].includes(key) &&
              provider &&
              ["snowflake", "zendesk", "intercom"].includes(provider)
            ) {
              return false;
            }
            const coreValue = coreNode[key as keyof DataSourceViewContentNode];
            // Special case for folder parents, the ones retrieved using getContentNodesForStaticDataSourceView do not
            // contain any parentInternalIds.
            if (provider === null && key === "parentInternalIds") {
              return false;
            }
            // Ignore the type mismatch between core and connectors for mime types that were already identified.
            if (
              key === "type" &&
              coreNode.mimeType &&
              ((value === "channel" &&
                CHANNEL_MIME_TYPES.includes(coreNode.mimeType)) ||
                (value === "database" &&
                  DATABASE_MIME_TYPES.includes(coreNode.mimeType)) ||
                (value === "file" &&
                  FILE_MIME_TYPES.includes(coreNode.mimeType)))
            ) {
              return false;
            }
            // For Google Drive, connectors does not fill the parentInternalId at google_drive/index.ts#L324.
            if (
              ["parentInternalId"].includes(key) &&
              provider === "google_drive" &&
              coreValue !== null &&
              value === null
            ) {
              return false;
            }

            // Special case for Google drive spreadsheets:
            // title is '{spreadsheetName} - {sheetName}' for core, but only '{sheetName}' for connectors (not always).
            // The value in core is an improvement over the value in connectors, so we omit the difference.
            if (
              key === "title" &&
              coreNode.mimeType === "application/vnd.google-apps.spreadsheet"
            ) {
              return false;
            }

            // Ignore sourceUrls returned by core but left empty by connectors.
            if (key === "sourceUrl" && value === null && coreValue !== null) {
              return false;
            }
            // Special case for the google drive sourceUrl: convert docs.google.com to drive.google.com/file for comparison.
            if (key === "sourceUrl" && value && coreValue) {
              // Remove usp=drivesdk suffix from core value for comparison
              let cleanedCoreValue = coreValue.toString().replace(/\?.*$/, "");
              // Convert docs.google.com to drive.google.com/file for comparison
              if (cleanedCoreValue.startsWith("https://docs.google.com/")) {
                const fileId = cleanedCoreValue.split("/")[5]; // Get file ID from URL
                cleanedCoreValue = `https://drive.google.com/file/d/${fileId}/view`;
              }

              if (cleanedCoreValue === value) {
                return false;
              }
            }
            // Ignore the sourceUrl mismatch when it's empty string in connectors and undefined in core.
            if (key === "sourceUrl" && value === "" && !coreValue) {
              return false;
            }

            // Special case for the titles of Webcrawler folders: we add a trailing slash in core but not in connectors.
            if (
              key === "title" &&
              provider === "webcrawler" &&
              coreValue === `${value}/`
            ) {
              return false;
            }
            // Special case for expandable: if the core node is not expandable and the connectors one is, it means
            // that the difference comes from the fact that the node has no children: we omit from the log.
            if (key === "expandable" && value === true && coreValue === false) {
              return false;
            }
            // Special case for Slack's providerVisibility: we only check if providerVisibility === "private" so
            // having a falsy value in core and "public" in connectors is the same.
            if (
              key === "providerVisibility" &&
              provider === "slack" &&
              value === "public" &&
              !coreValue
            ) {
              return false;
            }
            // Special case for Slack's permission:
            // connectors uses "read_write" for selected nodes whereas we always set it to "read" for nodes from core.
            if (
              key === "permission" &&
              provider === "slack" &&
              value === "read_write" &&
              coreValue === "read"
            ) {
              return false;
            }
            // Special case for Snowflake's title: we sometimes observe the internal ID database.schema.table used as
            // the title in connectors, ignoring these occurrences.
            if (
              key === "title" &&
              provider === "snowflake" &&
              value.endsWith(coreValue) // value = database.schema.table, coreValue = table
            ) {
              return false;
            }
            if (Array.isArray(value) && Array.isArray(coreValue)) {
              return JSON.stringify(value) !== JSON.stringify(coreValue);
            }
            return value !== coreValue;
          })
          .map(([key, value]) => [
            key,
            {
              connectors: value,
              core: coreNode[key as keyof DataSourceViewContentNode],
            },
          ])
      );

      if (Object.keys(diff).length > 0) {
        localLogger.info(
          {
            internalId: connectorsNode.internalId,
            diff,
          },
          "[CoreNodes] Node mismatch"
        );
      }
    }
  });
  if (
    missingInternalIds.length > 0 &&
    // Snowflake's root call returns all the selected databases, schemas and tables even if non-root.
    !(
      provider === "snowflake" &&
      missingInternalIds.every((id) =>
        coreContentNodes.some((n) => n.parentInternalIds?.includes(id))
      )
    )
  ) {
    localLogger.info(
      {
        missingInternalIds,
        coreNodesCount: coreContentNodes.length,
        maxPageSizeReached: coreContentNodes.length === 1000, // max value determined by the limit set in getContentNodesForDataSourceViewFromCore
      },
      "[CoreNodes] Missing nodes from core"
    );
  }
  const extraCoreInternalIds = coreContentNodes
    .filter(
      (coreNode) =>
        !connectorsContentNodes.some(
          (n) => n.internalId === coreNode.internalId
          // Special case
          // Notion syncing folder is not in connectors but it's in core.
          // Connector's notion unknown folder can map to core's syncing OR unknown folder.
          // See https://github.com/dust-tt/dust/issues/10340
        ) && coreNode.internalId !== "notion-syncing"
    )
    // There is some specific code to Intercom in retrieveIntercomConversationsPermissions that hides the empty team folders + the teams folder if !hasTeamsWithReadPermission
    // TBD whether this logic will be reproduced for core, ignoring for now.
    .filter(
      (coreNode) =>
        provider !== "intercom" ||
        !coreNode.internalId.startsWith("intercom-team")
    )
    // The endpoints in the Zendesk connector do not return anything as children of a category, core does.
    // This will be considered as an improvement, if it turns out to be a bad user experience this will be removed, ignoring for now.
    .filter(
      (coreNode) =>
        provider !== "zendesk" ||
        !coreNode.internalId.startsWith("zendesk-article")
    )
    .map((coreNode) => coreNode.internalId);
  if (extraCoreInternalIds.length > 0) {
    localLogger.info(
      { extraCoreInternalIds },
      "[CoreNodes] Received extraneous core nodes"
    );
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
