import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getFlattenedContentNodesOfViewTypeForDataSourceView } from "@app/lib/api/data_source_view";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  DataSourceViewContentNode,
  WithAPIErrorResponse,
} from "@app/types";

export type ListTablesResponseBody = {
  tables: DataSourceViewContentNode[];
  nextPageCursor: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ListTablesResponseBody>>,
  auth: Authenticator,
  { dataSourceView }: { dataSourceView: DataSourceViewResource }
): Promise<void> {
  if (!dataSourceView.canReadOrAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
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

      const pagination = paginationRes.value;

      const contentNodes =
        await getFlattenedContentNodesOfViewTypeForDataSourceView(
          dataSourceView,
          {
            viewType: "table",
            pagination,
          }
        );

      if (contentNodes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: contentNodes.error.message,
          },
        });
      }

      return res.status(200).json({
        tables: contentNodes.value.nodes,
        nextPageCursor: contentNodes.value.nextPageCursor,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    dataSourceView: { requireCanReadOrAdministrate: true },
  })
);
