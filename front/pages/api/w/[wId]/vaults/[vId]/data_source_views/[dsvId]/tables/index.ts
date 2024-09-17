import type {
  DataSourceViewContentNode,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import { getOffsetPaginationParams } from "@app/lib/api/pagination";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

export type ListTablesResponseBody = {
  tables: DataSourceViewContentNode[];
};

const DEFAULT_LIMIT = 100;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ListTablesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { dsvId, vId } = req.query;
  if (typeof dsvId !== "string" || typeof vId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSourceView = await DataSourceViewResource.fetchById(auth, dsvId);

  if (
    !dataSourceView ||
    vId !== dataSourceView.vault.sId ||
    !dataSourceView.canList(auth)
  ) {
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
      const paginationRes = getOffsetPaginationParams(req, {
        defaultLimit: DEFAULT_LIMIT,
        defaultOffset: 0,
      });
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

      const contentNodes = await getContentNodesForDataSourceView(
        dataSourceView,
        {
          viewType: "tables",
          // Use core api as ww want a flat list of all tables, even for managed datasources.
          onlyCoreAPI: true,
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

      return res.status(200).json({ tables: contentNodes.value.nodes });

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

export default withSessionAuthenticationForWorkspace(handler);
