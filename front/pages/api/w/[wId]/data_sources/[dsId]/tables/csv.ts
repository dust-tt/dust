import type { CoreAPITable, WithAPIErrorResponse } from "@dust-tt/types";
import { assertNever, UpsertTableFromCsvRequestSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { handleDataSourceTableCSVUpsert } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

type PostTableCSVAsyncResponseType = {
  table: {
    table_id: string;
  };
};

type PostTableCSVResponseType = {
  table: CoreAPITable;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostTableCSVAsyncResponseType | PostTableCSVResponseType
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
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
      status_code: 404,
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
      const bodyValidation = UpsertTableFromCsvRequestSchema.decode(req.body);
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

      const params = bodyValidation.right;

      const r = await handleDataSourceTableCSVUpsert({
        auth,
        params,
        dataSource,
      });
      if (r.isErr()) {
        switch (r.error.code) {
          case "missing_csv":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: r.error.message,
              },
            });
          case "data_source_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "data_source_error",
                message: r.error.message,
              },
            });
          case "invalid_parent_id":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: r.error.message,
              },
            });
          case "invalid_rows":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_rows_request_error",
                message: r.error.message,
              },
            });
          case "resource_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "table_not_found",
                message: r.error.message,
              },
            });
          case "internal_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: r.error.message,
              },
            });
          default:
            assertNever(r.error.code);
        }
      }

      return res.status(200).json(r.value);
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

export default withSessionAuthenticationForWorkspace(handler);
