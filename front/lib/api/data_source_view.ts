import type {
  ContentNodesViewType,
  CoreAPIContentNode,
  CoreAPIDatasourceViewFilter,
  DataSourceViewContentNode,
  DataSourceViewType,
  PatchDataSourceViewType,
  Result,
} from "@dust-tt/types";
import { assertNever, CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import {
  FOLDERS_TO_HIDE_IF_EMPTY_MIME_TYPES,
  getContentNodeFromCoreNode,
} from "@app/lib/api/content_nodes";
import type { CursorPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";

const DEFAULT_PAGINATION_LIMIT = 1000;

// If `internalIds` is not provided, it means that the request is for all the content nodes in the view.
interface GetContentNodesForDataSourceViewParams {
  internalIds?: string[];
  parentId?: string;
  pagination?: CursorPaginationParams;
  viewType: ContentNodesViewType;
}

interface GetContentNodesForDataSourceViewResult {
  nodes: DataSourceViewContentNode[];
  total: number;
  totalIsAccurate: boolean;
  nextPageCursor: string | null;
}

function filterNodesByViewType(
  nodes: CoreAPIContentNode[],
  viewType: ContentNodesViewType
) {
  switch (viewType) {
    case "document":
      return nodes.filter(
        (node) =>
          node.children_count > 0 ||
          ["folder", "document"].includes(node.node_type)
      );
    case "table":
      return nodes.filter(
        (node) =>
          node.children_count > 0 ||
          ["folder", "table"].includes(node.node_type)
      );
    case "all":
      return nodes;
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

export async function getContentNodesForDataSourceView(
  dataSourceView: DataSourceViewResource | DataSourceViewType,
  {
    internalIds,
    parentId,
    viewType,
    pagination,
  }: GetContentNodesForDataSourceViewParams
): Promise<Result<GetContentNodesForDataSourceViewResult, Error>> {
  const limit = pagination?.limit ?? DEFAULT_PAGINATION_LIMIT;

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

  let nextPageCursor: string | null = pagination ? pagination.cursor : null;

  let resultNodes: CoreAPIContentNode[] = [];
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

  const nodes = resultNodes.map((node) =>
    getContentNodeFromCoreNode(
      dataSourceView instanceof DataSourceViewResource
        ? dataSourceView.toJSON()
        : dataSourceView,
      node,
      viewType
    )
  );
  const sortedNodes = !internalIds
    ? nodes
    : internalIds.flatMap((id) =>
        nodes.filter((node) => node.internalId === id)
      );

  return new Ok({
    nodes: sortedNodes,
    total: coreRes.value.hit_count,
    totalIsAccurate: coreRes.value.hit_count_is_accurate,
    nextPageCursor: nextPageCursor,
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
