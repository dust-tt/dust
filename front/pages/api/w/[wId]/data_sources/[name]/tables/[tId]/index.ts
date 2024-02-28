import type {
  CoreAPITable,
  DataSourceType,
  WithAPIErrorReponse,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { deleteTable } from "@app/lib/api/tables";
import { Authenticator, getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetTableResponseBody = {
  table: CoreAPITable;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<GetTableResponseBody>>
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

  const tableId = req.query.tId;
  if (!tableId || typeof tableId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The table id is missing.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const coreAPI = new CoreAPI(logger);
      const tableRes = await coreAPI.getTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        tableId,
      });
      if (tableRes.isErr()) {
        logger.error(
          {
            dataSourcename: dataSource.name,
            workspaceId: owner.id,
            error: tableRes.error,
          },
          "Failed to get table."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get table.",
          },
        });
      }

      const { table } = tableRes.value;

      return res.status(200).json({ table });

    case "DELETE":
      return handleDeleteTableByIdRequest(req, res, {
        owner,
        dataSource,
        tableId,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);

export async function handleDeleteTableByIdRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  {
    owner,
    dataSource,
    tableId,
  }: {
    owner: WorkspaceType;
    dataSource: DataSourceType;
    tableId: string;
  }
) {
  const delRes = await deleteTable({
    owner,
    projectId: dataSource.dustAPIProjectId,
    dataSourceName: dataSource.name,
    tableId,
  });

  if (delRes.isErr()) {
    switch (delRes.error.type) {
      case "not_found_error":
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: delRes.error.notFoundError.type,
            message: delRes.error.notFoundError.message,
          },
        });
      case "invalid_request_error":
      case "internal_server_error":
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete table.",
          },
        });
      default:
        assertNever(delRes.error);
    }
  }

  res.status(200).end();
}
