import type { GetFoldersResponseType } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetFoldersResponseType>>,
  auth: Authenticator,
  dataSource: DataSourceResource
): Promise<void> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;
      const folders = await coreAPI.getDataSourceFolders(
        {
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
        },
        {
          limit,
          offset,
        }
      );

      if (folders.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source folders.",
            data_source_error: folders.error,
          },
        });
      }

      res.status(200).json({
        folders: folders.value.folders,
        total: folders.value.total,
      });
      return;
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

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, "dataSource")
);
