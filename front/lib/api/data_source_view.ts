import type {
  ContentNodesViewType,
  CoreAPIError,
  DataSourceViewContentNode,
  DataSourceViewType,
  Result,
} from "@dust-tt/types";
import { ConnectorsAPI, CoreAPI, Err, Ok, removeNulls } from "@dust-tt/types";
import assert from "assert";

import config from "@app/lib/api/config";
import { getContentNodeInternalIdFromTableId } from "@app/lib/api/content_nodes";
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

// If `internalIds` is not provided, it means that the request is for all the content nodes in the view.
interface GetContentNodesForDataSourceViewParams {
  internalIds?: string[];
  parentId?: string;
  pagination?: OffsetPaginationParams;
  viewType: ContentNodesViewType;
  // If onlyCoreAPI is true, the function will only use the Core API to fetch the content nodes.
  onlyCoreAPI?: boolean;
}

interface GetContentNodesForDataSourceViewResult {
  nodes: DataSourceViewContentNode[];
  total: number;
}

async function getContentNodesForManagedDataSourceView(
  dataSourceView: DataSourceViewResource | DataSourceViewType,
  { internalIds, parentId, viewType }: GetContentNodesForDataSourceViewParams
): Promise<Result<GetContentNodesForDataSourceViewResult, Error>> {
  const { dataSource } = dataSourceView;

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  assert(
    dataSource.connectorId,
    "Connector ID is required for managed data sources."
  );

  // If no internalIds nor parentIds are provided, get the root nodes of the data source view.
  if (!internalIds && !parentId && dataSourceView.parentsIn) {
    internalIds = dataSourceView.parentsIn;
  }

  // If no internalIds are provided, fetch the children of the parent node, or root nodes of data source.
  if (!internalIds) {
    const connectorsRes = await connectorsAPI.getConnectorPermissions({
      connectorId: dataSource.connectorId,
      filterPermission: "read",
      includeParents: true,
      // Passing an undefined parentInternalId will fetch the root nodes.
      parentId,
      viewType,
    });

    if (connectorsRes.isErr()) {
      return new Err(
        new Error(
          "An error occurred while fetching the resources' children content nodes."
        )
      );
    }

    return new Ok({
      nodes: connectorsRes.value.resources,
      // Connectors API does not support pagination yet, so the total is the length of the nodes.
      total: connectorsRes.value.resources.length,
    });
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
    return new Ok({
      nodes: connectorsRes.value.nodes,
      // Connectors API does not support pagination yet, so the total is the length of the nodes.
      total: connectorsRes.value.nodes.length,
    });
  }
}

// Static data sources are data sources that are not managed by a connector.
// They are flat and do not have a hierarchy.
async function getContentNodesForStaticDataSourceView(
  dataSourceView: DataSourceViewResource,
  { internalIds, pagination, viewType }: GetContentNodesForDataSourceViewParams
): Promise<
  Result<GetContentNodesForDataSourceViewResult, Error | CoreAPIError>
> {
  const { dataSource } = dataSourceView;

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // Early return if there are no internalIds.
  if (internalIds?.length === 0) {
    return new Ok({
      nodes: [],
      total: 0,
    });
  }

  if (viewType === "documents") {
    const documentsRes = await coreAPI.getDataSourceDocuments(
      {
        dataSourceId: dataSource.dustAPIDataSourceId,
        documentIds: internalIds,
        projectId: dataSource.dustAPIProjectId,
        viewFilter: dataSourceView.toViewFilter(),
      },
      pagination
    );

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

    return new Ok({
      nodes: documentsAsContentNodes,
      total: documentsRes.value.total,
    });
  } else {
    const tablesRes = await coreAPI.getTables(
      {
        dataSourceId: dataSource.dustAPIDataSourceId,
        projectId: dataSource.dustAPIProjectId,
        tableIds: internalIds,
        viewFilter: dataSourceView.toViewFilter(),
      },
      pagination
    );

    if (tablesRes.isErr()) {
      return tablesRes;
    }

    const tablesAsContentNodes: DataSourceViewContentNode[] =
      tablesRes.value.tables.map((table) => ({
        dustDocumentId: table.table_id,
        expandable: false,
        internalId: getContentNodeInternalIdFromTableId(
          dataSourceView,
          table.table_id
        ),
        lastUpdatedAt: table.timestamp,
        parentInternalId: null,
        parentInternalIds: table.parents,
        permission: "read",
        preventSelection: false,
        sourceUrl: null,
        title: table.name,
        type: "database",
      }));

    return new Ok({
      nodes: tablesAsContentNodes,
      total: tablesRes.value.total,
    });
  }
}

export async function getContentNodesForDataSourceView(
  dataSourceView: DataSourceViewResource,
  params: GetContentNodesForDataSourceViewParams
): Promise<
  Result<GetContentNodesForDataSourceViewResult, Error | CoreAPIError>
> {
  const { onlyCoreAPI = false } = params;

  let contentNodesResult: GetContentNodesForDataSourceViewResult;

  if (dataSourceView.dataSource.connectorId && !onlyCoreAPI) {
    const contentNodesRes = await getContentNodesForManagedDataSourceView(
      dataSourceView,
      params
    );

    if (contentNodesRes.isErr()) {
      return contentNodesRes;
    }

    contentNodesResult = contentNodesRes.value;
  } else {
    const contentNodesRes = await getContentNodesForStaticDataSourceView(
      dataSourceView,
      params
    );

    if (contentNodesRes.isErr()) {
      return contentNodesRes;
    }

    contentNodesResult = contentNodesRes.value;
  }

  const contentNodesInView = filterAndCropContentNodesByView(
    dataSourceView,
    contentNodesResult.nodes
  );

  return new Ok({
    nodes: contentNodesInView,
    total: contentNodesResult.total,
  });
}
