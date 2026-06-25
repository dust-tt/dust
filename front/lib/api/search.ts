import config from "@app/lib/api/config";
import {
  getContentNodeFromCoreNode,
  NON_REMOTE_DATABASE_TABLE_MIME_TYPES,
  NON_SEARCHABLE_NODES_MIME_TYPES,
} from "@app/lib/api/content_nodes";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { normalizeUrlForSourceUrlSearch } from "@app/lib/connectors";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getSearchFilterFromDataSourceViews } from "@app/lib/search";
import logger from "@app/logger/logger";
import type {
  DataSourceContentNode,
  SearchRequestBodyType,
} from "@app/types/api/search";
import { DATA_SOURCE_NODE_ID } from "@app/types/core/content_node";
import type { SearchWarningCode } from "@app/types/core/core_api";
import { CoreAPI } from "@app/types/core/core_api";
import type { APIError } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ParsedUrlQuery } from "querystring";

export type SearchResult = {
  nodes: DataSourceContentNode[];
  warningCode: SearchWarningCode | null;
  nextPageCursor: string | null;
  resultsCount: number | null;
};

type SearchError = {
  status: ContentfulStatusCode;
  error: APIError;
};

function getSpaceAccessPriority(space: SpaceResource) {
  // Global spaces have highest priority.
  if (space.isGlobal()) {
    return 3;
  }

  // Open spaces have second highest priority.
  if (space.isRegularAndOpen()) {
    return 2;
  }

  // For restricted spaces: provisioned groups get higher priority than manual membership.
  if (space.groups.some((g) => g.isProvisioned())) {
    return 1;
  }

  // Restricted spaces with manual membership have the lowest priority.
  return 0;
}

function selectHighestPriorityDataSourceView(
  views: DataSourceViewResource[]
): DataSourceViewResource {
  if (views.length <= 1) {
    return views[0];
  }

  const viewsWithPriority = views.map((view) => ({
    view,
    priority: getSpaceAccessPriority(view.space),
    spaceName: view.space.name,
  }));

  viewsWithPriority.sort(
    (a, b) => b.priority - a.priority || a.spaceName.localeCompare(b.spaceName)
  );

  return viewsWithPriority[0].view;
}

export async function handleSearch(
  reqQuery: ParsedUrlQuery,
  auth: Authenticator,
  {
    allowAdminSearch,
    dataSourceViewIdsBySpaceId,
    excludeNonRemoteDatabaseTables,
    includeDataSources,
    nodeIds,
    parentId,
    prioritizeSpaceAccess,
    query,
    searchSort,
    searchSourceUrls,
    spaceIds,
    viewType,
  }: SearchRequestBodyType
): Promise<Result<SearchResult, SearchError>> {
  let spaces;
  if (allowAdminSearch) {
    const allWorkspaceSpaces = await SpaceResource.listWorkspaceSpaces(auth);
    spaces = allWorkspaceSpaces.filter(
      (s) => s.canAdministrate(auth) || s.canRead(auth)
    );
  } else {
    spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  }

  if (spaces.length === 0) {
    return new Err({
      status: 400,
      error: {
        type: "invalid_request_error",
        message: "No accessible spaces found.",
      },
    });
  }

  const availableSpaceIds = new Set(spaces.map((s) => s.sId));
  if (spaceIds && spaceIds.some((sId) => !availableSpaceIds.has(sId))) {
    return new Err({
      status: 404,
      error: {
        type: "space_not_found",
        message: "Invalid space ids.",
      },
    });
  }

  const spacesToSearch = spaces.filter(
    (s) => !spaceIds || spaceIds.includes(s.sId)
  );

  const allDatasourceViews = await DataSourceViewResource.listBySpaces(
    auth,
    spacesToSearch
  );

  // If we don't have any data source views, we return an empty result without
  // failing, allowing the caller to still use other search sources
  if (!allDatasourceViews.length) {
    return new Ok({
      nodes: [],
      resultsCount: 0,
      warningCode: null,
      nextPageCursor: null,
    });
  }

  const filteredDatasourceViews = dataSourceViewIdsBySpaceId
    ? allDatasourceViews.filter((dsv) =>
        dataSourceViewIdsBySpaceId[dsv.space.sId]?.includes(dsv.sId)
      )
    : allDatasourceViews;

  const excludedNodeMimeTypes = [
    ...(nodeIds || searchSourceUrls ? [] : NON_SEARCHABLE_NODES_MIME_TYPES),
    ...(excludeNonRemoteDatabaseTables
      ? NON_REMOTE_DATABASE_TABLE_MIME_TYPES
      : []),
  ];

  const searchFilterRes = getSearchFilterFromDataSourceViews(
    filteredDatasourceViews,
    {
      excludedNodeMimeTypes,
      includeDataSources,
      viewType,
      nodeIds,
      parentId,
    }
  );

  if (searchFilterRes.isErr()) {
    return new Err({
      status: 400,
      error: {
        type: "invalid_request_error",
        message: `Invalid search filter parameters: ${searchFilterRes.error.message}`,
      },
    });
  }

  const searchFilter = searchFilterRes.value;

  const paginationRes = getCursorPaginationParams(reqQuery);
  if (paginationRes.isErr()) {
    return new Err({
      status: 400,
      error: {
        type: "invalid_pagination_parameters",
        message: "Invalid pagination parameters",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const searchQuery =
    query && searchSourceUrls ? normalizeUrlForSourceUrlSearch(query) : query;
  const searchRes = await coreAPI.searchNodes({
    // To run an empty search, we need to pass undefined to the API.
    query: searchQuery && searchQuery.length > 0 ? searchQuery : undefined,
    filter: searchFilter,
    options: {
      cursor: paginationRes.value?.cursor ?? undefined,
      limit: paginationRes.value?.limit,
      search_source_urls: searchSourceUrls,
      sort: searchSort,
    },
  });

  if (searchRes.isErr()) {
    return new Err({
      status: 500,
      error: {
        type: "internal_server_error",
        message: searchRes.error.message,
      },
    });
  }

  const nodes = removeNulls(
    searchRes.value.nodes.map((node) => {
      const matchingViews = allDatasourceViews.filter(
        (dsv) =>
          dsv.dataSource.dustAPIDataSourceId === node.data_source_id &&
          (node.node_id === DATA_SOURCE_NODE_ID ||
            !dsv.parentsIn ||
            node.parents?.some(
              (p) => !dsv.parentsIn || dsv.parentsIn.includes(p)
            ))
      );

      if (matchingViews.length === 0) {
        return null;
      }

      const selectedViews = prioritizeSpaceAccess
        ? [selectHighestPriorityDataSourceView(matchingViews)]
        : matchingViews;

      return {
        ...getContentNodeFromCoreNode(node, viewType),
        dataSource: selectedViews[0].dataSource.toJSON(),
        dataSourceViews: selectedViews.map((dsv) => dsv.toJSON()),
      };
    })
  );

  return new Ok({
    nodes,
    resultsCount: searchRes.value.hit_count,
    warningCode: searchRes.value.warning_code,
    nextPageCursor: searchRes.value.next_page_cursor,
  });
}
