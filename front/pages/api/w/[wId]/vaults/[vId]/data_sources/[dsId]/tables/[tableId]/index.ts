import type { CoreAPITable, WithAPIErrorResponse } from "@dust-tt/types";
import {
  assertNever,
  PatchDataSourceTableRequestBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { upsertTable } from "@app/lib/api/data_sources";
import { deleteTable } from "@app/lib/api/tables";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export type PatchTableResponseBody = {
  table?: CoreAPITable;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchTableResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { tableId, dsId, vId } = req.query;

  if (
    typeof dsId !== "string" ||
    typeof vId !== "string" ||
    typeof tableId !== "string"
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request query parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByName(auth, dsId);

  if (
    !dataSource ||
    vId !== dataSource.vault.sId ||
    !dataSource.canRead(auth)
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
    case "PATCH":
      if (!dataSource.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
          },
        });
      }

      if (dataSource.connectorId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot upsert a document on a managed data source.",
          },
        });
      }

      const bodyValidation = PatchDataSourceTableRequestBodySchema.decode(
        req.body
      );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const upsertRes = await upsertTable({
        ...bodyValidation.right,
        tableId,
        async: bodyValidation.right.async ?? false,
        dataSource: dataSource.toJSON(),
        auth,
      });

      if (upsertRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error upserting the document.",
          },
        });
      }

      res.status(200).json({
        table: upsertRes.value?.table,
      });
      return;

    case "DELETE":
      const delRes = await deleteTable({
        owner: auth.getNonNullableWorkspace(),
        dataSource: dataSource.toJSON(),
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
      break;
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
