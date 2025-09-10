import { fetcherWithBody } from "@app/lib/swr/swr";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  GetContentNodesOrChildrenRequestBodyType,
  GetDataSourceViewContentNodes,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/content-nodes";
import type {
  DataSourceType,
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
} from "@app/types";
import { assertNever, normalizeError } from "@app/types";

export function getTableIdForContentNode(
  dataSource: DataSourceType,
  contentNode: LightContentNode
): string {
  if (contentNode.type !== "table") {
    throw new Error(`ContentNode type ${contentNode.type} is not supported`);
  }

  // We specify whether the connector supports TableQuery as a safeguard in case somehow a non-table node was selected.
  switch (dataSource.connectorProvider) {
    // For static tables, the tableId is the contentNode internalId.
    case null:
    case "bigquery":
    case "microsoft":
    case "notion":
    case "salesforce":
    case "snowflake":
    case "google_drive":
      return contentNode.internalId;

    case "confluence":
    case "github":
    case "gong":
    case "intercom":
    case "slack":
    case "slack_bot":
    case "webcrawler":
    case "zendesk":
      throw new Error(
        `Provider ${dataSource.connectorProvider} is not supported`
      );

    default:
      assertNever(dataSource.connectorProvider);
  }
}

async function expandFolderToTables(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType,
  folderNode: LightContentNode
): Promise<LightContentNode[]> {
  try {
    const url = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/content-nodes`;
    const body: GetContentNodesOrChildrenRequestBodyType = {
      internalIds: undefined,
      parentId: folderNode.internalId,
      viewType: "table",
      sorting: undefined,
    };

    const result: GetDataSourceViewContentNodes = await fetcherWithBody([
      url,
      body,
      "POST",
    ]);

    return result.nodes.filter((child) => child.type === "table");
  } catch (error) {
    logger.error(
      {
        error: normalizeError(error),
        folderId: folderNode.internalId,
        workspaceId: owner.sId,
        dataSourceViewId: dataSourceView.sId,
      },
      "Failed to fetch children for folder"
    );
    throw new Error(
      `Failed to fetch children for folder ${folderNode.internalId}`
    );
  }
}

export async function expandFoldersToTables(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType,
  folderNodes: LightContentNode[]
): Promise<LightContentNode[]> {
  const tablesArrays = await concurrentExecutor(
    folderNodes,
    (folderNode) => expandFolderToTables(owner, dataSourceView, folderNode),
    { concurrency: 5 }
  );

  return tablesArrays.flat();
}
