import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { getRun } from "@app/lib/api/run";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { SpecificationType } from "@app/types/app";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { RunType } from "@app/types/run";

export type GetRunResponseBody = {
  run: RunType;
  spec: SpecificationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetRunResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { aId, runId } = req.query;

  if (typeof aId !== "string" || typeof runId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request parameters",
      },
    });
  }

  const app = await AppResource.fetchById(auth, aId);

  if (!app || !app.canRead(auth) || app.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to access was not found",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const result = await getRun(auth, app.toJSON(), runId);

      if (!result) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "run_not_found",
            message: "The run was not found",
          },
        });
      }

      return res.status(200).json({
        run: result.run,
        spec: result.spec,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanRead: true } })
);
