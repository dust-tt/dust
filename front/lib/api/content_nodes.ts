import type {
  ContentNodeType,
  CoreAPIContentNode,
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type logger from "@app/logger/logger";

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
  localLogger,
}: {
  connectorsContentNodes: DataSourceViewContentNode[];
  coreContentNodes: DataSourceViewContentNode[];
  localLogger: typeof logger;
}) {
  connectorsContentNodes.forEach((connectorsNode) => {
    const coreNodes = coreContentNodes.filter(
      (coreNode) => coreNode.internalId === connectorsNode.internalId
    );
    if (coreNodes.length === 0) {
      localLogger.info(
        { internalId: connectorsNode.internalId },
        "[CoreNodes] No core content node matching this internal ID"
      );
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
            if (key === "preventSelection") {
              return false;
            }
            const coreValue = coreNode[key as keyof DataSourceViewContentNode];
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
  const extraCoreInternalIds = coreContentNodes
    .filter(
      (coreNode) =>
        !connectorsContentNodes.some(
          (n) => n.internalId === coreNode.internalId
        )
    )
    .map((coreNode) => coreNode.internalId);
  if (extraCoreInternalIds.length > 0) {
    localLogger.info(
      { extraCoreInternalIds },
      "[CoreNodes] Received unexpected core nodes"
    );
  }
}

export function getContentNodeMetadata(node: CoreAPIContentNode): {
  type: ContentNodeType;
} {
  // this is approximate and will be cleaned up when we turn ContentNodeType into the same nodeType as in core
  // the main point is that it correctly identifies documents as files as this is used in ContentNodeTree
  switch (node.node_type) {
    case "Table":
      return { type: "database" };
    case "Folder":
      return { type: "folder" };
    case "Document":
      return { type: "file" };
    default:
      assertNever(node.node_type);
  }
}
