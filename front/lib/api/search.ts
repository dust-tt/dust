import * as t from "io-ts";
import type { NextApiRequest } from "next";

import {
  getContentNodeFromCoreNode,
  NON_SEARCHABLE_NODES_MIME_TYPES,
} from "@app/lib/api/content_nodes";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getSearchFilterFromDataSourceViews } from "@app/lib/search";
import logger from "@app/logger/logger";
import type {
  APIError,
  ContentNodeWithParent,
  DataSourceType,
  DataSourceViewType,
  Result,
  SearchWarningCode,
} from "@app/types";
import { CoreAPI, Err, Ok, removeNulls } from "@app/types";

import config from "./config";

export type DataSourceContentNode = ContentNodeWithParent & {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
};

export type SearchResult = {
  nodes: DataSourceContentNode[];
  warningCode: SearchWarningCode | null;
};

type SearchError = {
  status: number;
  error: APIError;
};

const BaseSearchBody = t.type({
  viewType: t.union([
    t.literal("table"),
    t.literal("document"),
    t.literal("all"),
  ]),
  spaceIds: t.union([t.array(t.string), t.undefined]),
  includeDataSources: t.boolean,
  limit: t.number,
});

const TextSearchBody = t.intersection([
  BaseSearchBody,
  t.type({
    query: t.string,
  }),
  t.partial({
    nodeIds: t.undefined,
    searchSourceUrls: t.boolean,
  }),
]);

const NodeIdSearchBody = t.intersection([
  BaseSearchBody,
  t.type({
    nodeIds: t.array(t.string),
  }),
  t.partial({
    query: t.undefined,
    searchSourceUrls: t.undefined,
  }),
]);

export const SearchRequestBody = t.union([TextSearchBody, NodeIdSearchBody]);

export type SearchRequestBodyType = t.TypeOf<typeof SearchRequestBody>;

export async function handleSearch(
  req: NextApiRequest,
  auth: Authenticator,
  searchParams: SearchRequestBodyType
): Promise<Result<SearchResult, SearchError>> {
  const {
    query,
    includeDataSources,
    viewType,
    spaceIds,
    nodeIds,
    searchSourceUrls,
  } = searchParams;

  const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  if (!spaces.length) {
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

  if (!allDatasourceViews.length) {
    return new Err({
      status: 400,
      error: {
        type: "invalid_request_error",
        message: "No datasource views found in accessible spaces.",
      },
    });
  }

  const searchFilterResult = getSearchFilterFromDataSourceViews(
    auth.getNonNullableWorkspace(),
    allDatasourceViews,
    {
      excludedNodeMimeTypes: NON_SEARCHABLE_NODES_MIME_TYPES,
      includeDataSources,
      viewType,
      nodeIds,
    }
  );

  const paginationRes = getCursorPaginationParams(req);
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
  const searchRes = await coreAPI.searchNodes({
    query,
    filter: searchFilterResult,
    options: {
      cursor: paginationRes.value?.cursor ?? undefined,
      limit: paginationRes.value?.limit,
      search_source_urls: searchSourceUrls,
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
          (!dsv.parentsIn ||
            node.parents?.some(
              (p) => !dsv.parentsIn || dsv.parentsIn.includes(p)
            ))
      );

      if (matchingViews.length === 0) {
        return null;
      }

      return {
        ...getContentNodeFromCoreNode(node, viewType),
        dataSource: matchingViews[0].dataSource.toJSON(),
        dataSourceViews: matchingViews.map((dsv) => dsv.toJSON()),
      };
    })
  );

  return new Ok({
    nodes,
    warningCode: searchRes.value.warning_code,
  });
}
