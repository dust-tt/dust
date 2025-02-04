import type {
  ContentNodesViewType,
  CoreAPIContentNode,
  CoreAPIDatasourceViewFilter,
  CoreAPIError,
  DataSourceViewContentNode,
  DataSourceViewType,
  PatchDataSourceViewType,
  Result,
} from "@dust-tt/types";
import {
  assertNever,
  ConnectorsAPI,
  CoreAPI,
  Err,
  isDevelopment,
  isDustWorkspace,
  MIME_TYPES,
  Ok,
  removeNulls,
} from "@dust-tt/types";
import assert from "assert";

import config from "@app/lib/api/config";
import {
  computeNodesDiff,
  FOLDERS_SELECTION_PREVENTED_MIME_TYPES,
  FOLDERS_TO_HIDE_IF_EMPTY_MIME_TYPES,
  getContentNodeInternalIdFromTableId,
  getContentNodeType,
  NON_EXPANDABLE_NODES_MIME_TYPES,
} from "@app/lib/api/content_nodes";
import type {
  CursorPaginationParams,
  OffsetPaginationParams,
} from "@app/lib/api/pagination";
import { isCursorPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { SPREADSHEET_MIME_TYPES } from "@app/lib/content_nodes";
import type { DustError } from "@app/lib/error";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import {
  getWorkspaceByModelId,
  renderLightWorkspaceType,
} from "@app/lib/workspace";
import logger from "@app/logger/logger";

// TODO(nodes-core): remove this upon project cleanup
const DEFAULT_STATIC_DATA_SOURCE_PAGINATION_LIMIT = 10_000;

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
  // TODO(nodes-core): remove offset pagination upon project cleanup
  pagination?: CursorPaginationParams | OffsetPaginationParams;
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
      if (
        [
          "connector_rate_limit_error",
          "connector_authorization_error",
        ].includes(connectorsRes.error.type)
      ) {
        return new Err(new Error(connectorsRes.error.message));
      }
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

function filterNodesByViewType(
  nodes: CoreAPIContentNode[],
  viewType: ContentNodesViewType
) {
  switch (viewType) {
    case "documents":
      return nodes.filter(
        (node) =>
          node.children_count > 0 ||
          node.node_type !== "Table" ||
          // TODO(nodes-core): replace this with either an "all" viewType or a DEFAULT_VIEWTYPE_BY_CONNECTOR_PROVIDER
          node.mime_type === MIME_TYPES.SNOWFLAKE.TABLE
      );
    case "tables":
      return nodes.filter(
        (node) => node.children_count > 0 || node.node_type === "Table"
      );
    default:
      assertNever(viewType);
  }
}

function removeCatchAllFoldersIfEmpty(
  nodes: CoreAPIContentNode[]
): CoreAPIContentNode[] {
  return nodes.filter(
    (node) =>
      !FOLDERS_TO_HIDE_IF_EMPTY_MIME_TYPES.includes(node.mime_type) ||
      node.children_count > 0
  );
}

function makeCoreDataSourceViewFilter(
  dataSourceView: DataSourceViewResource | DataSourceViewType
): CoreAPIDatasourceViewFilter {
  return {
    data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
    view_filter: dataSourceView.parentsIn ?? [],
  };
}

const ROOT_PARENT_ID = "root";

async function getContentNodesForDataSourceViewFromCore(
  dataSourceView: DataSourceViewResource | DataSourceViewType,
  {
    internalIds,
    parentId,
    viewType,
    pagination,
  }: GetContentNodesForDataSourceViewParams
): Promise<Result<GetContentNodesForDataSourceViewResult, Error>> {
  const limit = pagination?.limit ?? 1000;

  // There's an early return possible on !dataSourceView.dataSource.connectorId && internalIds?.length === 0,
  // won't include it for now as we are shadow-reading.
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // We use searchNodes to fetch the content nodes from core:
  // - either a specific list of nodes provided by internalIds if they are set;
  // - or all the direct children of the parent_id, if specified;
  // - or all the roots of the data source view, if no parent_id nor internalIds
  //   are provided.

  // In the latter case, the view might either have "parentsIn" set, in which
  // case the "roots" of the data source view are the nodes in parentsIn, so we
  // set node_ids to parentsIn. Otherwise, the "roots" of the data source view
  // are the root nodes of the data source, obtained by the special parent_id
  // "root".

  // In any case, there is a data_source_view filter, which is always applied.
  const node_ids =
    internalIds ??
    (parentId ? undefined : dataSourceView.parentsIn ?? undefined);
  const parent_id =
    parentId ??
    (internalIds
      ? undefined
      : dataSourceView.parentsIn
        ? undefined
        : ROOT_PARENT_ID);

  // TODO(nodes-core): remove offset pagination upon project cleanup
  let nextPageCursor: string | null = pagination
    ? isCursorPaginationParams(pagination)
      ? pagination.cursor
      : null
    : null;

  let resultNodes: CoreAPIContentNode[] = [];
  do {
    const coreRes = await coreAPI.searchNodes({
      filter: {
        data_source_views: [makeCoreDataSourceViewFilter(dataSourceView)],
        node_ids,
        parent_id,
      },
      options: { limit, cursor: nextPageCursor ?? undefined },
    });

    if (coreRes.isErr()) {
      return new Err(new Error(coreRes.error.message));
    }

    const filteredNodes = removeCatchAllFoldersIfEmpty(
      filterNodesByViewType(coreRes.value.nodes, viewType)
    );

    resultNodes = [...resultNodes, ...filteredNodes].slice(0, limit);
    nextPageCursor = coreRes.value.next_page_cursor;
  } while (nextPageCursor && resultNodes.length < limit);

  const expandable = (node: CoreAPIContentNode) =>
    !NON_EXPANDABLE_NODES_MIME_TYPES.includes(node.mime_type) &&
    node.children_count > 0 &&
    // if we aren't in tables view, spreadsheets are not expandable
    !(viewType !== "tables" && SPREADSHEET_MIME_TYPES.includes(node.mime_type));

  return new Ok({
    nodes: resultNodes.map((node) => {
      return {
        internalId: node.node_id,
        parentInternalId: node.parent_id ?? null,
        // TODO(2025-01-27 aubin): remove this once the handling of nodes without a title has been improved in the api/v1
        title: node.title === "Untitled document" ? node.node_id : node.title,
        sourceUrl: node.source_url ?? null,
        permission: "read",
        lastUpdatedAt: node.timestamp,
        providerVisibility: node.provider_visibility,
        parentInternalIds: node.parents,
        type: getContentNodeType(node),
        expandable: expandable(node),
        mimeType: node.mime_type,
        preventSelection: FOLDERS_SELECTION_PREVENTED_MIME_TYPES.includes(
          node.mime_type
        ),
      };
    }),
    total: resultNodes.length,
    nextPageCursor: nextPageCursor,
  });
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

  // Use a high pagination limit since the product UI doesn't support pagination yet,
  // even though static data sources can contain many documents via API ingestion.
  const paginationParams = pagination ?? {
    // TODO(nodes-core): remove this upon project cleanup
    limit: DEFAULT_STATIC_DATA_SOURCE_PAGINATION_LIMIT,
    offset: 0,
  };

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // Early return if there are no internalIds.
  if (internalIds?.length === 0) {
    return new Ok({
      nodes: [],
      total: 0,
    });
  }

  if (viewType === "documents") {
    if (isCursorPaginationParams(paginationParams)) {
      throw new Error(
        "Cursor pagination is not supported for static data sources. Note: this code path should be deleted at the end of the project nodes core (2025-02-03)."
      );
    }
    const documentsRes = await coreAPI.getDataSourceDocuments(
      {
        dataSourceId: dataSource.dustAPIDataSourceId,
        documentIds: internalIds,
        projectId: dataSource.dustAPIProjectId,
        viewFilter: dataSourceView.toViewFilter(),
      },
      paginationParams
    );

    if (documentsRes.isErr()) {
      return documentsRes;
    }

    const documentsAsContentNodes: DataSourceViewContentNode[] =
      documentsRes.value.documents.map((doc) => {
        let title = doc.document_id;
        for (const t of doc.tags) {
          if (t.startsWith("title:")) {
            title = t.slice(6);
            break;
          }
        }
        return {
          expandable: false,
          internalId: doc.document_id,
          lastUpdatedAt: doc.timestamp,
          parentInternalId: null,
          parentInternalIds: [],
          permission: "read",
          preventSelection: false,
          sourceUrl: doc.source_url ?? null,
          title,
          type: "file",
        };
      });

    return new Ok({
      nodes: documentsAsContentNodes,
      total: documentsRes.value.total,
    });
  } else {
    if (isCursorPaginationParams(paginationParams)) {
      throw new Error(
        "Cursor pagination is not supported for static data sources. Note: this code path should be deleted at the end of the project nodes core (2025-02-03)."
      );
    }
    const tablesRes = await coreAPI.getTables(
      {
        dataSourceId: dataSource.dustAPIDataSourceId,
        projectId: dataSource.dustAPIProjectId,
        tableIds: internalIds,
        viewFilter: dataSourceView.toViewFilter(),
      },
      paginationParams
    );

    if (tablesRes.isErr()) {
      return tablesRes;
    }

    const tablesAsContentNodes: DataSourceViewContentNode[] =
      tablesRes.value.tables.map((table) => ({
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
  params: GetContentNodesForDataSourceViewParams,
  showConnectorsNodes?: boolean
): Promise<
  Result<GetContentNodesForDataSourceViewResult, Error | CoreAPIError>
> {
  const { onlyCoreAPI = false } = params;

  let contentNodesResult: GetContentNodesForDataSourceViewResult;

  const connectorsStart = new Date();
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

  const connectorsLatency = new Date().getTime() - connectorsStart.getTime();

  const localLogger = logger.child({
    dataSourceId: dataSourceView.dataSource.sId,
    connectorId: dataSourceView.dataSource.connectorId,
    dataSourceViewId: dataSourceView.sId,
    provider: dataSourceView.dataSource.connectorProvider,
    viewType: params.viewType,
    isRootCall:
      !params.parentId && !params.internalIds && !dataSourceView.parentsIn,
    parentId: params.parentId,
    internalIds: params.internalIds,
    parentsIn: dataSourceView.parentsIn || undefined,
  });

  const coreStart = new Date();
  // shadow read from core
  const coreContentNodesRes = await getContentNodesForDataSourceViewFromCore(
    dataSourceView,
    params
  );
  const coreLatency = new Date().getTime() - coreStart.getTime();

  // TODO(20250126, nodes-core): Remove this after project end
  localLogger.info(
    {
      connectorsLatency,
      coreLatency,
      diff: coreLatency - connectorsLatency,
    },
    "[CoreNodes] Latency between connectors and core"
  );

  if (coreContentNodesRes.isErr()) {
    localLogger.error(
      { error: coreContentNodesRes.error, panic: true },
      "[CoreNodes] Could not fetch content nodes from core"
    );
  } else if (coreContentNodesRes.isOk()) {
    const diff = computeNodesDiff({
      connectorsContentNodes: contentNodesResult.nodes,
      coreContentNodes: coreContentNodesRes.value.nodes,
      provider: dataSourceView.dataSource.connectorProvider,
      pagination: params.pagination,
      viewType: params.viewType,
      localLogger,
    });

    if (showConnectorsNodes) {
      if (diff.length == 0) {
        diff.push({
          internalId: "missing-connectors-nodes",
          parentInternalId: null,
          title: "ALL IS FINE",
          type: "folder",
          permission: "read",
          lastUpdatedAt: new Date().getTime(),
          parentInternalIds: [],
          sourceUrl: null,
          expandable: false,
          preventSelection: false,
        });
      }
      return new Ok({
        nodes: filterAndCropContentNodesByView(dataSourceView, diff),
        total: diff.length,
      });
    }

    // if development or dust workspace
    const workspaceModel = await getWorkspaceByModelId(
      dataSourceView.space.workspaceId
    );
    if (!workspaceModel) {
      logger.error(
        { dataSourceView, panic: true },
        "No workspace for data source view"
      );
    } else {
      const workspace = renderLightWorkspaceType({ workspace: workspaceModel });
      if (isDevelopment() || isDustWorkspace(workspace)) {
        const contentNodesInView = filterAndCropContentNodesByView(
          dataSourceView,
          coreContentNodesRes.value.nodes
        );
        return new Ok({
          nodes: contentNodesInView,
          total: coreContentNodesRes.value.nodes.length,
        });
      }
    }
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

export async function handlePatchDataSourceView(
  auth: Authenticator,
  patchBody: PatchDataSourceViewType,
  dataSourceView: DataSourceViewResource
): Promise<
  Result<
    DataSourceViewResource,
    Omit<DustError, "code"> & {
      code: "unauthorized" | "internal_error";
    }
  >
> {
  if (!dataSourceView.canAdministrate(auth)) {
    return new Err({
      name: "dust_error",
      code: "unauthorized",
      message: "Only admins can update data source views.",
    });
  }

  let updateResultRes;
  if ("parentsIn" in patchBody) {
    const { parentsIn } = patchBody;
    updateResultRes = await dataSourceView.setParents(parentsIn ?? []);
  } else {
    const parentsToAdd =
      "parentsToAdd" in patchBody ? patchBody.parentsToAdd : [];
    const parentsToRemove =
      "parentsToRemove" in patchBody ? patchBody.parentsToRemove : [];

    updateResultRes = await dataSourceView.updateParents(
      parentsToAdd,
      parentsToRemove
    );
  }

  if (updateResultRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: updateResultRes.error.message,
    });
  }

  await dataSourceView.setEditedBy(auth);

  return new Ok(dataSourceView);
}
