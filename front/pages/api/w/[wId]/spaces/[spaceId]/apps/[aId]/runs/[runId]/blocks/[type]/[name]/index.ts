import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { BlockType, RunType, WithAPIErrorResponse } from "@app/types";
import { CoreAPI } from "@app/types";

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

export type GetRunBlockResponseBody = {
  run: RunType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetRunBlockResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { aId } = req.query;
  if (typeof aId !== "string") {
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
        message:
          "Retrieving content of runs requires write access to the app's space.",
      },
    });
  }

  let runId: string | null =
    typeof req.query.runId === "string" ? req.query.runId : null;

  if (runId === "saved") {
    runId = app.savedRun;
  }

  switch (req.method) {
    case "GET":
      if (!runId || runId.length == 0) {
        res.status(200).json({ run: null });
        return;
      }
      const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
      const run = await coreAPI.getRunBlock({
        projectId: app.dustAPIProjectId,
        runId: runId,
        blockType: req.query.type as BlockType,
        blockName: req.query.name as string,
      });

      if (run.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "The run block retrieval failed.",
            app_error: run.error,
          },
        });
      }

      res.status(200).json({ run: run.value.run });
      return;

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
  // App block runs contain sensitive data and requires write access to the app's space.
  // Read permission is not enough as it's available to all space users (or everybody for public spaces)
  withResourceFetchingFromRoute(handler, { space: { requireCanWrite: true } })
);
