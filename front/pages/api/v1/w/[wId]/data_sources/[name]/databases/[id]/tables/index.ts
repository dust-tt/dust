import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { CoreAPI, CoreAPIDatabaseTable } from "@app/lib/core_api";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

type ListDatabaseTablesResponseBody = {
  tables: CoreAPIDatabaseTable[];
};

const UpsertDatabaseTableRequestBodySchema = t.type({
  name: t.string,
  description: t.string,
});

type UpsertDatabaseTableResponseBody = {
  table: CoreAPIDatabaseTable;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    ListDatabaseTablesResponseBody | UpsertDatabaseTableResponseBody
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

  switch (req.method) {
    case "GET":
      const tablesRes = await CoreAPI.getDatabaseTables({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        databaseId,
      });
      if (tablesRes.isErr()) {
        logger.error(
          {
            dataSourcename: dataSource.name,
            workspaceId: owner.id,
            error: tablesRes.error,
          },
          "Failed to get database tables."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get database tables.",
          },
        });
      }

      const { tables } = tablesRes.value;

      return res.status(200).json({ tables });

    case "POST":
      const bodyValidation = UpsertDatabaseTableRequestBodySchema.decode(
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
      const { name, description } = bodyValidation.right;
      const id = generateModelSId();

      const upsertRes = await CoreAPI.upsertDatabaseTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        databaseId,
        tableId: id,
        name,
        description,
      });

      if (upsertRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            databaseName: name,
            databaseId: id,
            error: upsertRes.error,
          },
          "Failed to upsert database table."
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert database table.",
          },
        });
      }

      const { table } = upsertRes.value;

      return res.status(200).json({ table });

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
