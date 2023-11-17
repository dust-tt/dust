import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { CoreAPI, CoreAPIDatabaseRow } from "@app/lib/core_api";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

const UpsertDatabaseRowsRequestBodySchema = t.type({
  contents: t.record(
    t.string,
    t.record(t.string, t.union([t.string, t.null, t.number, t.boolean]))
  ),
  truncate: t.union([t.boolean, t.undefined]),
});

type UpsertDatabaseRowsResponseBody = {
  success: true;
};

const ListDatabaseRowsReqQuerySchema = t.type({
  offset: t.number,
  limit: t.number,
});

type ListDatabaseRowsResponseBody = {
  rows: CoreAPIDatabaseRow[];
  offset: number;
  limit: number;
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    UpsertDatabaseRowsResponseBody | ListDatabaseRowsResponseBody
  >
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
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

  if (!isDevelopmentOrDustWorkspace(owner)) {
    res.status(404).end();
    return;
  }

  const dataSource = await getDataSource(auth, req.query.name as string);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const databaseId = req.query.id;
  if (!databaseId || typeof databaseId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The database id is missing.",
      },
    });
  }

  const tableId = req.query.tableId;
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
      const queryValidation = ListDatabaseRowsReqQuerySchema.decode(req.query);
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request query: ${pathError}`,
          },
          status_code: 400,
        });
      }
      const { offset, limit } = queryValidation.right;

      const listRes = await CoreAPI.getDatabaseRows({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        databaseId,
        tableId,
        offset,
        limit,
      });

      if (listRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            databaseName: name,
            databaseId: databaseId,
            tableId: tableId,
            error: listRes.error,
          },
          "Failed to list database rows."
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to list database rows.",
          },
        });
      }

      const { rows, total } = listRes.value;
      return res.status(200).json({ rows, offset, limit, total });

    case "POST":
      const bodyValidation = UpsertDatabaseRowsRequestBodySchema.decode(
        req.body
      );
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
      const { contents, truncate } = bodyValidation.right;

      const upsertRes = await CoreAPI.upsertDatabaseRows({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        databaseId,
        tableId: tableId,
        contents,
        truncate,
      });

      if (upsertRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            databaseName: name,
            databaseId: databaseId,
            tableId: tableId,
            error: upsertRes.error,
          },
          "Failed to upsert database rows."
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert database rows.",
          },
        });
      }

      return res.status(200).json({ success: true });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
