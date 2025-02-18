import type {
  ContentNodesViewType,
  CoreAPIContentNode,
  CoreAPIDatasourceViewFilter,
  DataSourceViewContentNode,
  DataSourceViewType,
  PatchDataSourceViewType,
  Result,
} from "@dust-tt/types";
import { assertNever, CoreAPI, Err, Ok, removeNulls } from "@dust-tt/types";

import config from "@app/lib/api/config";
import {
  FOLDERS_SELECTION_PREVENTED_MIME_TYPES,
  FOLDERS_TO_HIDE_IF_EMPTY_MIME_TYPES,
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
  // TODO(nodes-core): remove offset pagination upon project cleanup
  pagination?: CursorPaginationParams | OffsetPaginationParams;
  viewType: ContentNodesViewType;
}

interface GetContentNodesForDataSourceViewResult {
  nodes: DataSourceViewContentNode[];
  total: number;
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
          ["Folder", "Document"].includes(node.node_type)
      );
    case "tables":
      return nodes.filter(
        (node) =>
          node.children_count > 0 ||
          ["Folder", "Table"].includes(node.node_type)
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
    // if we aren't in tables/all view, spreadsheets are not expandable
    !(
      !["tables", "all"].includes(viewType) &&
      SPREADSHEET_MIME_TYPES.includes(node.mime_type)
    );

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
        type: node.node_type,
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
