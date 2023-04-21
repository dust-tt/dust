import { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { BlockType, RunType } from "@app/types/run";

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
  res: NextApiResponse<GetRunBlockResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to modify datasets for was not found.",
      },
    });
  }

  const app = await getApp(auth, req.query.aId as string);

  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to modify datasets for was not found.",
      },
    });
  }

  let runId = req.query.runId;
  if (runId === "saved") {
    runId = app.savedRun;
  }

  switch (req.method) {
    case "GET":
      if (!runId || runId.length == 0) {
        res.status(200).json({ run: null });
        return;
      }

      const run = await DustAPI.getRunBlock(
        app.dustAPIProjectId,
        runId as string,
        req.query.type as BlockType,
        req.query.name as string
      );

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

export default withLogging(handler);
