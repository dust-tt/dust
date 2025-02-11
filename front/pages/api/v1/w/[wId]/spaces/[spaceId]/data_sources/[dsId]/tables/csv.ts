import type {
  PostTableCSVAsyncResponseType,
  PostTableCSVResponseType,
} from "@dust-tt/client";
import { UpsertTableFromCsvRequestSchema } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { upsertTable } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

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
  auth: Authenticator
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

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dsId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "v1_data_sources_tables_csv" }
  );

  // Handling the case where `spaceId` is undefined to keep support for the legacy endpoint (not under
  // space, global space assumed for the auth (the authenticator associated with the app, not the
  // user)).
  let { spaceId } = req.query;
  if (typeof spaceId !== "string") {
    if (auth.isSystemKey()) {
      // We also handle the legacy usage of connectors that taps into connected data sources which
      // are not in the global space. If this is a system key we trust it and set the `spaceId` to the
      // dataSource.space.sId.
      spaceId = dataSource?.space.sId;
    } else {
      spaceId = (await SpaceResource.fetchWorkspaceGlobalSpace(auth)).sId;
    }
  }

  if (!dataSource || dataSource.space.sId !== spaceId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (dataSource.space.kind === "conversations") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
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
          case "invalid_parents":
          case "invalid_parent_id":
          case "invalid_url":
          case "missing_csv":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
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
          case "invalid_csv":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_rows_request_error",
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
            assertNever(upsertRes.error.code);
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

export default withPublicAPIAuthentication(handler);
