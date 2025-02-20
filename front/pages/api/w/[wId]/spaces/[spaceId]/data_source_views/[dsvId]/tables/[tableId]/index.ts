import type { CoreAPITable, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourceViewTableResponseBody = {
  table: CoreAPITable;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDataSourceViewTableResponseBody>
  >,
  auth: Authenticator,
  { dataSourceView }: { dataSourceView: DataSourceViewResource }
): Promise<void> {
  const { tableId } = req.query;

  if (typeof tableId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid table id.",
      },
    });
  }

  if (!dataSourceView.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source view you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
      const tableRes = await coreAPI.getTable({
        projectId: dataSourceView.dataSource.dustAPIProjectId,
        dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
        tableId,
      });

      if (tableRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message:
              "There was an error retrieving the data source view's document.",
            data_source_error: tableRes.error,
          },
        });
      }

      const { table } = tableRes.value;

      return res.status(200).json({ table });

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
    dataSourceView: { requireCanRead: true },
  })
);
