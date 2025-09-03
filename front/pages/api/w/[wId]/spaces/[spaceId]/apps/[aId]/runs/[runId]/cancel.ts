import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { CoreAPI, isString } from "@app/types";

export type PostRunCancelResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostRunCancelResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
) {
  const { aId, runId } = req.query;
  if (!isString(aId) || !isString(runId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const app = await AppResource.fetchById(auth, aId);
  if (!app || app.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  if (!app.canWrite(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Canceling a run requires write access to the app's space.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

      // First check if the run exists and get its current status
      const runStatus = await coreAPI.getRunStatus({
        projectId: app.dustAPIProjectId,
        runId: runId,
      });

      if (runStatus.isErr()) {
        if (runStatus.error.code === "run_not_found") {
          // If run not found, it might have already been cancelled
          // Return success to allow UI to reset properly
          return res.status(200).json({ success: true });
        }

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch run status.",
            app_error: runStatus.error,
          },
        });
      }

      // Only allow canceling runs that are currently running
      if (runStatus.value.run.status.run !== "running") {
        // If not running, consider it already stopped
        return res.status(200).json({ success: true });
      }

      // Cancel the run using the Core API
      const cancelResult = await coreAPI.cancelRun({
        projectId: app.dustAPIProjectId,
        runId: runId,
      });

      if (cancelResult.isErr()) {
        logger.error(
          {
            error: cancelResult.error,
            runId,
            projectId: app.dustAPIProjectId,
          },
          "Failed to cancel run"
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to cancel the run.",
            app_error: cancelResult.error,
          },
        });
      }

      logger.info(
        { runId, projectId: app.dustAPIProjectId },
        "Run cancelled successfully"
      );

      return res.status(200).json({ success: true });

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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanWrite: true } })
);
