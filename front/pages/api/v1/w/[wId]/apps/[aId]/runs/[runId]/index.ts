import { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import { RunType } from "@app/types/run";

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

export type GetRunResponseBody = {
  run: RunType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetRunResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const auth = await Authenticator.fromKey(keyRes.value, req.query.wId as string);

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
  }

  const app = await getApp(auth, req.query.aId as string);

  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const runId = req.query.runId as string;

      logger.info(
        {
          workspace: {
            sId: owner.sId,
            name: owner.name,
          },
          app: app.sId,
          runId,
        },
        "App run retrieve"
      );

      // TODO(spolu): This is borderline security-wise as it allows to recover a full run from the
      // runId assuming the app is public. We should use getRun and also enforce in getRun that we
      // retrieve only our own runs. Basically this assumes the `runId` as a secret.
      const runRes = await CoreAPI.getRun(app.dustAPIProjectId, runId);
      if (runRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "run_error",
            message: "There was an error retrieving the run.",
            run_error: runRes.error,
          },
        });
      }
      const run: RunType = runRes.value.run;
      run.specification_hash = run.app_hash;
      delete run.app_hash;

      if (run.status.run === "succeeded" && run.traces.length > 0) {
        run.results = run.traces[run.traces.length - 1][1];
      } else {
        run.results = null;
      }

      res.status(200).json({ run });
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

export default withLogging(handler);
