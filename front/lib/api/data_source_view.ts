import type {
  ContentNodesViewType,
  CoreAPIError,
  DataSourceViewContentNode,
  Result,
} from "@dust-tt/types";
import { ConnectorsAPI, CoreAPI, Err, Ok, removeNulls } from "@dust-tt/types";
import assert from "assert";

import config from "@app/lib/api/config";
import type { OffsetPaginationParams } from "@app/lib/api/pagination";
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

    // Ensure that the node, or at least one of its ancestors, is within the
    // view. For parentInternalIds, include all of them  up to the highest one
    // in the hierarchy that is in the view, (which is last index, since parents
    // are ordered from leaf to root), or all of them  if the view is "full",
    // that is,  parentsIn is null.
    const indexToSplit = parentInternalIds.findLastIndex((p) =>
      dataSourceView.parentsIn?.includes(p)
    );
    const isInView = !viewHasParents || indexToSplit !== -1;

    if (isInView) {
      const parentIdsInView = !viewHasParents
        ? parentInternalIds
        : parentInternalIds.slice(0, indexToSplit + 1);

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
  internalIds: string[],
  { limit, offset }: { limit: number; offset: number }
): Promise<Result<DataSourceViewContentNode[], Error | CoreAPIError>> {
  const { dataSource } = dataSourceView;

  if (internalIds.length > 1) {
    return new Err(
      new Error("Internal ids should not be provided for static data sources.")
    );
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  if (viewType === "documents") {
    if (internalIds.length > 0) {
      const documentsRes = await coreAPI.getDataSourceDocuments({
        dataSourceId: dataSource.dustAPIDataSourceId,
        limit,
        offset,
        projectId: dataSource.dustAPIProjectId,
        viewFilter: dataSourceView.toViewFilter(),
      });

      if (documentsRes.isErr()) {
        return documentsRes;
      }
    } else {
      const documentsRes = await coreAPI.getDataSourceDocument({
        dataSourceId: dataSource.dustAPIDataSourceId,
        limit,
        offset,
        projectId: dataSource.dustAPIProjectId,
        viewFilter: dataSourceView.toViewFilter(),
      });

      if (documentsRes.isErr()) {
        return documentsRes;
      }
    }

    const documentsRes = await coreAPI.getDataSourceDocuments({
      dataSourceId: dataSource.dustAPIDataSourceId,
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
      dataSourceId: dataSource.dustAPIDataSourceId,
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

export async function getContentNodesForDataSourceView(
  dataSourceView: DataSourceViewResource,
  {
    includeChildren,
    internalIds,
    viewType,
  }: {
    includeChildren: boolean;
    internalIds: string[];
    viewType: ContentNodesViewType;
  },
  pagination: OffsetPaginationParams
): Promise<Result<DataSourceViewContentNode[], Error | CoreAPIError>> {
  let contentNodes: DataSourceViewContentNode[];

  if (dataSourceView.dataSource.connectorId) {
    const contentNodesRes = await getContentNodesForManagedDataSourceView(
      dataSourceView,
      {
        includeChildren: includeChildren === true,
        internalIds: removeNulls(internalIds),
        viewType,
      }
    );

    if (contentNodesRes.isErr()) {
      return contentNodesRes;
    }

    contentNodes = contentNodesRes.value;
  } else {
    const contentNodesRes = await getContentNodesForStaticDataSourceView(
      dataSourceView,
      viewType,
      internalIds,
      pagination
    );

    if (contentNodesRes.isErr()) {
      return contentNodesRes;
    }

    contentNodes = contentNodesRes.value;
  }

  const contentNodesInView = filterAndCropContentNodesByView(
    dataSourceView,
    contentNodes
  );

  return new Ok(contentNodesInView);
}
