import type {
  ConnectorProvider,
  ContentNodeType,
  CoreAPIContentNode,
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@dust-tt/types";
import { assertNever, MIME_TYPES } from "@dust-tt/types";

import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type logger from "@app/logger/logger";

export const NON_EXPANDABLE_NODES_MIME_TYPES = [
  MIME_TYPES.SLACK.CHANNEL,
  MIME_TYPES.GITHUB.DISCUSSIONS,
  MIME_TYPES.GITHUB.ISSUES,
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
      missingInternalIds.push(connectorsNode.internalId);
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
            if (["preventSelection", "lastUpdatedAt"].includes(key)) {
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
            // Ignore sourceUrls returned by core but left empty by connectors.
            if (key === "sourceUrl" && value === null && coreValue !== null) {
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
  if (missingInternalIds.length > 0) {
    localLogger.info(
      { missingInternalIds },
      "[CoreNodes] Missing nodes from core"
    );
  }
  const extraCoreInternalIds = coreContentNodes
    .filter(
      (coreNode) =>
        !connectorsContentNodes.some(
          (n) => n.internalId === coreNode.internalId
        )
    )
    .map((coreNode) => coreNode.internalId);
  if (extraCoreInternalIds.length > 0) {
    // There is some specific code to Intercom in retrieveIntercomConversationsPermissions that hides the empty team folders + the teams folder if !hasTeamsWithReadPermission
    // Reproducing this logic in core is complicated and seems over-engineered.
    if (
      provider !== "intercom" ||
      extraCoreInternalIds.some((id) => !id.startsWith("intercom-team"))
    ) {
      localLogger.info(
        { extraCoreInternalIds },
        "[CoreNodes] Received extraneous core nodes"
      );
    }
  }
}

export function getContentNodeMetadata(
  node: CoreAPIContentNode,
  viewType: "tables" | "documents"
): {
  type: ContentNodeType;
} {
  switch (node.mime_type) {
    case MIME_TYPES.CONFLUENCE.PAGE:
      return { type: "file" };
    case MIME_TYPES.CONFLUENCE.SPACE:
      return { type: "folder" };
    case MIME_TYPES.GITHUB.REPOSITORY:
      return { type: "folder" };
    case MIME_TYPES.GITHUB.CODE_ROOT:
      return { type: "folder" };
    case MIME_TYPES.GITHUB.CODE_DIRECTORY:
      return { type: "folder" };
    case MIME_TYPES.GITHUB.CODE_FILE:
      return { type: "file" };
    case MIME_TYPES.GITHUB.ISSUES:
      return { type: "database" };
    case MIME_TYPES.GITHUB.ISSUE:
      return { type: "file" };
    case MIME_TYPES.GITHUB.DISCUSSIONS:
      return { type: "channel" };
    case MIME_TYPES.GITHUB.DISCUSSION:
      return { type: "file" };
    case MIME_TYPES.GOOGLE_DRIVE.FOLDER:
      return { type: "folder" };
    case MIME_TYPES.INTERCOM.COLLECTION:
      return { type: "folder" };
    case MIME_TYPES.INTERCOM.TEAMS_FOLDER:
      return { type: "channel" };
    case MIME_TYPES.INTERCOM.CONVERSATION:
      return { type: "file" };
    case MIME_TYPES.INTERCOM.TEAM:
      return { type: "folder" };
    case MIME_TYPES.INTERCOM.ARTICLE:
      return { type: "file" };
    case MIME_TYPES.MICROSOFT.FOLDER:
      return { type: "folder" };
    case MIME_TYPES.NOTION.UNKNOWN_FOLDER:
      return { type: "folder" };
    case MIME_TYPES.NOTION.DATABASE:
      return { type: "database" };
    case MIME_TYPES.NOTION.PAGE:
      return { type: "file" };
    case MIME_TYPES.SLACK.CHANNEL:
      return { type: "channel" };
    case MIME_TYPES.SLACK.THREAD:
      return { type: "file" };
    case MIME_TYPES.SLACK.MESSAGES:
      return { type: "file" };
    case MIME_TYPES.SNOWFLAKE.DATABASE:
      return { type: "folder" };
    case MIME_TYPES.SNOWFLAKE.SCHEMA:
      return { type: "folder" };
    case MIME_TYPES.SNOWFLAKE.TABLE:
      return { type: "database" };
    case MIME_TYPES.WEBCRAWLER.FOLDER:
      return { type: "folder" };
    case MIME_TYPES.ZENDESK.HELP_CENTER:
      return { type: "folder" };
    case MIME_TYPES.ZENDESK.CATEGORY:
      return { type: "folder" };
    case MIME_TYPES.ZENDESK.ARTICLE:
      return { type: "file" };
    case MIME_TYPES.ZENDESK.TICKETS:
      return { type: "folder" };
    case MIME_TYPES.ZENDESK.TICKET:
      return { type: "file" };
    default:
      let type: ContentNodeType = "file";
      if (node.mime_type === "text/csv") {
        type = viewType === "tables" ? "database" : "file";
      }
      return { type };
  }
}
