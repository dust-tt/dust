import type { DataSourceType } from "@dust-tt/types";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { deleteDataSource } from "@app/lib/api/data_sources";
import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type DeleteDataSourceResponseBody = DataSourceType;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DeleteDataSourceResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "DELETE":
      const { wId } = req.query;
      if (!wId || typeof wId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request query is invalid, expects { workspaceId: string }.",
          },
        });
      }
      const result = await deleteDataSource(auth, req.query.name as string);
      if (result.isErr()) {
        switch (result.error.code) {
          case "data_source_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "data_source_not_found",
                message: "The data source was not found.",
              },
            });
          case "unauthorized_deletion":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message: `You are not authorized to delete this data source: ${result.error.message}`,
              },
            });
          default:
            assertNever(result.error.code);
        }
      }

      return res.status(200).json(result.value);

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthentication(handler);
