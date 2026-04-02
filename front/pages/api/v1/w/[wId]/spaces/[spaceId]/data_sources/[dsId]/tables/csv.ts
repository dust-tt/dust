import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { upsertTable } from "@app/lib/api/data_sources";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type {
  PostTableCSVAsyncResponseType,
  PostTableCSVResponseType,
} from "@dust-tt/client";
import { UpsertTableFromCsvRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,

  res: NextApiResponse<
    WithAPIErrorResponse<
      PostTableCSVAsyncResponseType | PostTableCSVResponseType
    >
  >,
  auth: Authenticator,
  { dataSource }: { dataSource: DataSourceResource }
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const r = UpsertTableFromCsvRequestSchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }
      const upsertRes = await upsertTable({
        auth,
        params: r.data,
        dataSource,
      });

      if (upsertRes.isErr()) {
        switch (upsertRes.error.code) {
          case "invalid_csv_and_file":
          case "invalid_parent_id":
          case "invalid_parents":
          case "invalid_url":
          case "title_is_empty":
          case "title_too_long":
          case "missing_csv":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: upsertRes.error.message,
              },
            });
          case "invalid_csv_content":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_rows_request_error",
                message: upsertRes.error.message,
              },
            });
          case "data_source_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "data_source_error",
                message: upsertRes.error.message,
              },
            });
          case "table_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "table_not_found",
                message: upsertRes.error.message,
              },
            });
          case "file_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "file_not_found",
                message: upsertRes.error.message,
              },
            });
          case "internal_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: upsertRes.error.message,
              },
            });
          default:
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: upsertRes.error.message,
              },
            });
        }
      }

      return res.status(200).json(upsertRes.value);
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

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    dataSource: { requireCanRead: true },
  })
);
