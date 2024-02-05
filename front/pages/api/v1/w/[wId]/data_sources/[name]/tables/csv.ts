import type { CoreAPIRow } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { isFeatureEnabled } from "@app/lib/api/feature_flags";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import {
  CreateTableFromCsvSchema,
  rowsFromCsv,
} from "@app/pages/api/w/[wId]/data_sources/[name]/tables/csv";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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

  if (!(await isFeatureEnabled(owner, "structured_data"))) {
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
    case "POST":
      const bodyValidation = CreateTableFromCsvSchema.decode(req.body);
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

      const { name, description, csv } = bodyValidation.right;
      const csvRowsRes = csv ? await rowsFromCsv(csv) : null;

      let csvRows: CoreAPIRow[] | undefined = undefined;
      if (csvRowsRes) {
        if (csvRowsRes.isErr()) {
          return apiError(req, res, {
            api_error: csvRowsRes.error,
            status_code: 400,
          });
        }

        csvRows = csvRowsRes.value;
      }

      if ((csvRows?.length ?? 0) > 500_000) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `CSV has too many rows: ${csvRows?.length} (max 500_000).`,
          },
          status_code: 400,
        });
      }

      const tableId = bodyValidation.right.tableId ?? generateModelSId();

      const tableRes = await coreAPI.upsertTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        description,
        name,
        tableId,
      });

      if (tableRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            tableId,
            tableName: name,
            error: tableRes.error,
          },
          "Failed to upsert table."
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert table.",
          },
        });
      }

      if (csvRows) {
        const rowsRes = await coreAPI.upsertTableRows({
          projectId: dataSource.dustAPIProjectId,
          dataSourceName: dataSource.name,
          tableId,
          rows: csvRows,
          truncate: true,
        });
        if (rowsRes.isErr()) {
          logger.error(
            {
              dataSourceName: dataSource.name,
              workspaceId: owner.id,
              tableId,
              tableName: name,
              error: rowsRes.error,
            },
            "Failed to upsert rows."
          );

          // Delete the table if it was created in this request.
          const delRes = await coreAPI.deleteTable({
            projectId: dataSource.dustAPIProjectId,
            dataSourceName: dataSource.name,
            tableId,
          });

          if (delRes.isErr()) {
            logger.error(
              {
                dataSourceName: dataSource.name,
                workspaceId: owner.id,
                tableId,
                tableName: name,
                error: delRes.error,
              },
              "Failed to delete table after failed upsert."
            );
          }

          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to upsert rows.",
            },
          });
        }
      }

      return res.status(200).json({ table: tableRes.value });

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

export default withLogging(handler);
