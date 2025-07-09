import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { getContentNodeFromCoreNode } from "@app/lib/api/content_nodes";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  DataSourceViewContentNode,
  SearchWarningCode,
  WithAPIErrorResponse,
} from "@app/types";
import { CoreAPI, MIN_SEARCH_QUERY_SIZE } from "@app/types";

export type SearchTablesResponseBody = {
  tables: DataSourceViewContentNode[];
  nextPageCursor: string | null;
  warningCode: SearchWarningCode | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SearchTablesResponseBody>>,
  auth: Authenticator,
  { dataSourceView }: { dataSourceView: DataSourceViewResource }
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const query = req.query.query as string;
  if (!query || query.length < MIN_SEARCH_QUERY_SIZE) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Query must be at least ${MIN_SEARCH_QUERY_SIZE} characters long.`,
      },
    });
  }

  if (!dataSourceView.canReadOrAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
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

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const searchRes = await coreAPI.searchNodes({
    query,
    filter: {
      data_source_views: [
        {
          data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
          view_filter: dataSourceView.parentsIn ?? [],
        },
      ],
      node_types: ["table"],
    },
    options: {
      limit: paginationRes.value?.limit,
      cursor: paginationRes.value?.cursor ?? undefined,
    },
  });

  if (searchRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: searchRes.error.message,
      },
    });
  }

  const tables = searchRes.value.nodes.map((node) => ({
    ...getContentNodeFromCoreNode(node, "table"),
    dataSourceView: dataSourceView.toJSON(),
  }));

  return res.status(200).json({
    tables,
    nextPageCursor: searchRes.value.next_page_cursor,
    warningCode: searchRes.value.warning_code,
  });
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    dataSourceView: { requireCanReadOrAdministrate: true },
  })
);
