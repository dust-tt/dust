import type { WithAPIErrorReponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { ListTablesResponseBody } from "@app/pages/api/v1/w/[wId]/data_sources/[name]/tables";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<ListTablesResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const plan = auth.plan();
  if (!owner || !plan) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  if (
    !owner.flags.includes("structured_data") &&
    !owner.flags.includes("auto_pre_ingest_all_databases")
  ) {
    res.status(404).end();
    return;
  }

  if (!req.query.name || typeof req.query.name !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name);
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
    case "GET":
      const coreAPI = new CoreAPI(logger);
      const tablesRes = await coreAPI.getTables({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
      });
      if (tablesRes.isErr()) {
        logger.error(
          {
            dataSourcename: dataSource.name,
            workspaceId: owner.id,
            error: tablesRes.error,
          },
          "Failed to get tables."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get tables.",
          },
        });
      }

      const { tables } = tablesRes.value;

      return res.status(200).json({ tables });

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

export default withLogging(handler);
