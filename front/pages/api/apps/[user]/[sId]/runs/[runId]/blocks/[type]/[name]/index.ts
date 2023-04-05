import { App, User } from "@app/lib/models";
import { auth_user } from "@app/lib/auth";
import { RunType } from "@app/types/run";
import { NextApiRequest, NextApiResponse } from "next";
import withLogging from "@app/logger/withlogging";

const { DUST_API } = process.env;

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
  res: NextApiResponse<GetRunBlockResponseBody>
): Promise<void> {
  let [authRes, appUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    res.status(authRes.error().status_code).end();
    return;
  }
  let auth = authRes.value();

  if (!appUser) {
    res.status(404).end();
    return;
  }

  let [app] = await Promise.all([
    App.findOne({
      where: {
        userId: appUser.id,
        sId: req.query.sId,
      },
    }),
  ]);

  if (!app) {
    res.status(404).end();
    return;
  }

  let runId = req.query.runId;
  if (runId === "saved") {
    runId = app.savedRun;
  }

  switch (req.method) {
    case "GET":
      if (!auth.canReadApp(app)) {
        res.status(404).end();
        return;
      }

      if (!runId || runId.length == 0) {
        res.status(200).json({ run: null });
        return;
      }

      const runRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs/${runId}/blocks/${req.query.type}/${req.query.name}`,
        {
          method: "GET",
        }
      );

      if (!runRes.ok) {
        res.status(500).end();
        return;
      }

      const run = await runRes.json();

      res.status(200).json({ run: run.response.run });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
