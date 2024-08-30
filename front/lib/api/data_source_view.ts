import type {
  ContentNodesViewType,
  CoreAPIError,
  DataSourceViewContentNode,
  Result,
} from "@dust-tt/types";
import { ConnectorsAPI, CoreAPI, Err, Ok, removeNulls } from "@dust-tt/types";
import assert from "assert";

import config from "@app/lib/api/config";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";

export function filterAndCropContentNodesByView(
  dataSourceView: DataSourceViewResource,
  contentNodes: DataSourceViewContentNode[]
): DataSourceViewContentNode[] {
  const viewHasParents = dataSourceView.parentsIn !== null;

  // Filter out content nodes that are not in the view.
  // Update the parentInternalIds of the content nodes to only include the parentInternalIds that are in the view.
  const contentNodesInView = contentNodes.map((node) => {
    const { parentInternalIds } = node;

    if (!parentInternalIds) {
      return null;
    }

    // We stop at the first parent that is in the view.
    const indexToSplit = parentInternalIds.findIndex((p) =>
      dataSourceView.parentsIn?.includes(p)
    );
    const isInView = !viewHasParents || indexToSplit !== -1;

    if (isInView) {
      const parentIdsInView = parentInternalIds.slice(0, indexToSplit);

      return {
        ...node,
        parentInternalIds: parentIdsInView,
      };
    } else {
      return null;
    }
  });

  return removeNulls(contentNodesInView);
}

export async function getContentNodesForManagedDataSourceView(
  dataSourceView: DataSourceViewResource,
  {
    includeChildren,
    internalIds,
    viewType,
  }: {
    includeChildren: boolean;
    internalIds: string[];
    viewType: ContentNodesViewType;
  }
): Promise<Result<DataSourceViewContentNode[], Error>> {
  const { dataSource } = dataSourceView;

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  assert(
    dataSource.connectorId,
    "Connector ID is required for managed data sources."
  );

  // If the request is for children, we need to fetch the children of the internal ids.
  if (includeChildren) {
    const [parentInternalId] = internalIds;

    const connectorsRes = await connectorsAPI.getConnectorPermissions({
      connectorId: dataSource.connectorId,
      filterPermission: "read",
      includeParents: true,
      parentId: parentInternalId ?? undefined,
      viewType,
    });

    if (connectorsRes.isErr()) {
      return new Err(
        new Error(
          "An error occurred while fetching the resources' children content nodes."
        )
      );
    }

    return new Ok(connectorsRes.value.resources);
  } else {
    const connectorsRes = await connectorsAPI.getContentNodes({
      connectorId: dataSource.connectorId,
      includeParents: true,
      internalIds,
      viewType,
    });
    if (connectorsRes.isErr()) {
      return new Err(
        new Error(
          "An error occurred while fetching the resources' content nodes."
        )
      );
    }

    return new Ok(connectorsRes.value.nodes);
  }
}

// Static data sources are data sources that are not managed by a connector.
// They are flat and do not have a hierarchy.
export async function getContentNodesForStaticDataSourceView(
  dataSourceView: DataSourceViewResource,
  viewType: ContentNodesViewType,
  { limit, offset }: { limit: number; offset: number }
): Promise<Result<DataSourceViewContentNode[], Error | CoreAPIError>> {
  const { dataSource } = dataSourceView;

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  if (viewType === "documents") {
    const documentsRes = await coreAPI.getDataSourceDocuments({
      dataSourceName: dataSource.name,
      limit,
      offset,
      projectId: dataSource.dustAPIProjectId,
      viewFilter: dataSourceView.toViewFilter(),
    });

    if (documentsRes.isErr()) {
      return documentsRes;
    }

    const documentsAsContentNodes: DataSourceViewContentNode[] =
      documentsRes.value.documents.map((doc) => ({
        dustDocumentId: doc.document_id,
        expandable: false,
        internalId: doc.document_id,
        lastUpdatedAt: doc.timestamp,
        parentInternalId: null,
        parentInternalIds: [],
        permission: "read",
        preventSelection: false,
        sourceUrl: doc.source_url ?? null,
        title: doc.document_id,
        type: "file",
      }));

    return new Ok(documentsAsContentNodes);
  } else {
    const tablesRes = await coreAPI.getTables({
      dataSourceName: dataSource.name,
      projectId: dataSource.dustAPIProjectId,
      viewFilter: dataSourceView.toViewFilter(),
    });

    if (tablesRes.isErr()) {
      return tablesRes;
    }

    const tablesAsContentNodes: DataSourceViewContentNode[] =
      tablesRes.value.tables.map((table) => ({
        dustDocumentId: table.table_id,
        expandable: false,
        internalId: table.table_id,
        lastUpdatedAt: table.timestamp,
        parentInternalId: null,
        parentInternalIds: [],
        permission: "read",
        preventSelection: false,
        sourceUrl: null,
        title: table.name,
        type: "database",
      }));

    return new Ok(tablesAsContentNodes);
  }
}
