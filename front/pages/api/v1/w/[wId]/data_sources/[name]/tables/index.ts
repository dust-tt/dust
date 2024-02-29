import type { CoreAPITableSchema, WithAPIErrorReponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type ListTablesResponseBody = {
  tables: {
    name: string;
    table_id: string;
    description: string;
    schema: CoreAPITableSchema | null;
  }[];
};

const UpsertDatabaseTableRequestBodySchema = t.type({
  table_id: t.union([t.string, t.undefined]),
  name: t.string,
  description: t.string,
});

type UpsertTableResponseBody = {
  table: {
    name: string;
    table_id: string;
    description: string;
    schema: CoreAPITableSchema | null;
  };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<ListTablesResponseBody | UpsertTableResponseBody>
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
  if (!owner || !plan || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
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

  const coreAPI = new CoreAPI(logger);

  switch (req.method) {
    case "GET":
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
            message: "Failed to retrieve tables.",
            data_source_error: tablesRes.error,
          },
        });
      }

      const { tables } = tablesRes.value;

      return res.status(200).json({
        tables: tables.map((table) => {
          return {
            name: table.name,
            table_id: table.table_id,
            description: table.description,
            schema: table.schema,
          };
        }),
      });

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
      const {
        name,
        description,
        table_id: maybeTableId,
      } = bodyValidation.right;

      const tableId = maybeTableId || generateModelSId();

      const tRes = await coreAPI.getTables({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
      });

      if (tRes.isErr()) {
        logger.error(
          {
            dataSourcename: dataSource.name,
            workspaceId: owner.id,
            error: tRes.error,
          },
          "Failed to retrieve tables."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve tables.",
            data_source_error: tRes.error,
          },
        });
      }

      const tableWithSameName = tRes.value.tables.find((t) => t.name === name);
      if (tableWithSameName && tableWithSameName.table_id !== tableId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Tables names must be unique within a data source.",
          },
        });
      }

      const upsertRes = await coreAPI.upsertTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        tableId,
        name,
        description,
      });

      if (upsertRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            databaseName: name,
            tableId,
            tableName: name,
            error: upsertRes.error,
          },
          "Failed to upsert table."
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert table (table names must be unique).",
            data_source_error: upsertRes.error,
          },
        });
      }

      const { table } = upsertRes.value;

      return res.status(200).json({
        table: {
          name: table.name,
          table_id: table.table_id,
          description: table.description,
          schema: table.schema,
        },
      });

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
