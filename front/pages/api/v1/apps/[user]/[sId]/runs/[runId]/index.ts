import { User, App } from "@app/lib/models";
import { NextApiRequest, NextApiResponse } from "next";
import logger from "@app/logger/logger";
import { auth_api_user } from "@app/lib/api/auth";
import withLogging from "@app/logger/withlogging";
import { APIError } from "@app/lib/api/error";
import { RunType } from "@app/types/run";

const { DUST_API } = process.env;

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
  res: NextApiResponse<APIError | GetRunResponseBody>
): Promise<void> {
  let [authRes, appUser] = await Promise.all([
    auth_api_user(req),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    const err = authRes.error();
    return res.status(err.status_code).json(err.api_error);
  }
  const auth = authRes.value();

  if (!appUser) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }

  let app = await App.findOne({
    where: {
      userId: appUser.id,
      sId: req.query.sId,
    },
  });

  if (!app) {
    res.status(404).json({
      error: {
        type: "app_not_found",
        message: "The app whose run you're trying to retrieve was not found.",
      },
    });
    return;
  }

  // We check for the `canRunApp` permisison as we don't let other users retrieve runs for apps they
  // don't own.
  if (!auth.canRunApp(app)) {
    res.status(404).json({
      error: {
        type: "app_user_mismatch_error",
        message:
          "Only apps that you own can be interacted with by API \
          (you can clone this app to run it).",
      },
    });
    return;
  }

  switch (req.method) {
    case "GET":
      let runId = req.query.runId;

      logger.info(
        {
          user: appUser.username,
          app: app.sId,
          runId,
        },
        "App run retrieve"
      );

      const runRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs/${runId}`,
        {
          method: "GET",
        }
      );

      if (!runRes.ok) {
        const error = await runRes.json();
        res.status(400).json({
          error: {
            type: "run_error",
            message: "There was an error retrieving the run.",
            run_error: error.error,
          },
        });
        return;
      }

      let run = (await runRes.json()).response.run;
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
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
      return;
  }
}

export default withLogging(handler);
