import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { CoreAPI } from "@app/types";

type QueryResponseType = {
  schema: Array<{
    name: string;
    value_type: string;
  }>;
  results: Array<Record<string, string | number | boolean | null | undefined>>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<QueryResponseType>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const { query, tableIds } = req.body;

      if (!query || typeof query !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Query is required and must be a string.",
          },
        });
      }

      if (!Array.isArray(tableIds) || tableIds.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "At least one table ID is required.",
          },
        });
      }

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

      const tables = tableIds.map((tableId: string) => ({
        project_id: parseInt(dataSource.dustAPIProjectId, 10),
        data_source_id: dataSource.dustAPIDataSourceId,
        table_id: tableId,
      }));

      const queryResult = await coreAPI.queryDatabase({
        tables,
        query,
      });

      if (queryResult.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message: queryResult.error.message,
          },
        });
      }

      return res.json({
        schema: queryResult.value.schema,
        results: queryResult.value.results.map((r) => r.value),
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
