import type { BlockType, RunType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import apiConfig from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

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
  auth: Authenticator
): Promise<void> {
  const app = await getApp(auth, req.query.aId as string);

  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
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

// We allow anyone with access to the app (getApp returns something) and the runId to retrieve the
// block status. Note: this means if runIds from our dust-apps are leaked they can be used to
// retrieve user data.
export default withSessionAuthenticationForWorkspace(handler, {
  allowUserOutsideCurrentWorkspace: true,
});
