import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { NON_SEARCHABLE_NODES_MIME_TYPES } from "@app/lib/api/content_nodes";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { searchContenNodesInSpace } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  DataSourceViewContentNode,
  SearchWarningCode,
  WithAPIErrorResponse,
} from "@app/types";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";

const SearchRequestBody = t.type({
  // Optional array of data source view IDs to search in.
  // If not provided or empty array, search across all data source views in the space.
  dataSourceViewIds: t.union([t.undefined, t.array(t.string)]),
  query: t.string,
  // should use ContentNodesViewTypeCodec, but the type system
  // fails to infer the type correctly.
  viewType: t.union([
    t.literal("table"),
    t.literal("document"),
    t.literal("all"),
  ]),
  includeDataSources: t.boolean,
  limit: t.number,
  parentId: t.union([t.undefined, t.string]),
});
export type PostSpaceSearchRequestBody = t.TypeOf<typeof SearchRequestBody>;

export type PostSpaceSearchResponseBody = {
  nodes: DataSourceViewContentNode[];
  total: number;
  warningCode: SearchWarningCode | null;
  nextPageCursor: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostSpaceSearchResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.canReadOrAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = SearchRequestBody.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);

    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
      status_code: 400,
    });
  }

  const { dataSourceViewIds, includeDataSources, query, viewType, parentId } =
    bodyValidation.right;

  // If no data source views are provided, use all data source views in the space.
  const dataSourceViews =
    !dataSourceViewIds || dataSourceViewIds.length === 0
      ? await DataSourceViewResource.listBySpace(auth, space)
      : await DataSourceViewResource.fetchByIds(auth, dataSourceViewIds);

  if (query.length < MIN_SEARCH_QUERY_SIZE && !parentId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Query must be at least ${MIN_SEARCH_QUERY_SIZE} characters long.`,
      },
    });
  }

  if (dataSourceViews.some((dsv) => dsv.space.id !== space.id)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "All datasource views must belong to the space.",
      },
    });
  }
  const paginationRes = getCursorPaginationParams(req);
  if (paginationRes.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_pagination_parameters",
        message: "Invalid pagination parameters",
      },
    });
  }

  logger.info(
    {
      workspaceId: auth.workspace()?.sId,
      params: bodyValidation.right,
      spaceId: space.sId,
    },
    "Search knowledge (single space)"
  );

  const searchRes = await searchContenNodesInSpace(
    auth,
    space,
    dataSourceViews,
    {
      excludedNodeMimeTypes: NON_SEARCHABLE_NODES_MIME_TYPES,
      includeDataSources,
      options: {
        limit: paginationRes.value?.limit,
        cursor: paginationRes.value?.cursor ?? undefined,
      },
      query,
      viewType,
      parentId,
    }
  );

  if (searchRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: searchRes.error.message,
      },
    });
  }

  return res.status(200).json({
    nodes: searchRes.value.nodes,
    total: searchRes.value.total,
    warningCode: searchRes.value.warningCode,
    nextPageCursor: searchRes.value.nextPageCursor,
  });
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
