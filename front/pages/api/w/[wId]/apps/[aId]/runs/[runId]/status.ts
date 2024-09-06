import type { RunType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import {AppResource} from "@app/lib/resources/app_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetRunStatusResponseBody = {
  run: RunType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetRunStatusResponseBody>>,
  auth: Authenticator
) {
  const app = await AppResource.fetchById(auth, req.query.aId as string);
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

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const run = await coreAPI.getRunStatus({
        projectId: app.dustAPIProjectId,
        runId: runId,
      });
      if (run.isErr()) {
        if (run.error.code === "run_not_found") {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "run_not_found",
              message: "The run was not found.",
            },
          });
        }

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "The run status retrieval failed.",
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

export default withSessionAuthenticationForWorkspace(handler, {
  allowUserOutsideCurrentWorkspace: true,
});
