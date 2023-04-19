import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { withLogging } from "@app/logger/withlogging";
import { RunType } from "@app/types/run";
import { NextApiRequest, NextApiResponse } from "next";

export type GetRunStatusResponseBody = {
  run: RunType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetRunStatusResponseBody>
) {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).end();
    return;
  }

  const app = await getApp(auth, req.query.aId as string);

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
      if (!runId || runId.length == 0) {
        res.status(200).json({ run: null });
        return;
      }

      const run = await DustAPI.getRunStatus(
        app.dustAPIProjectId,
        runId as string
      );
      if (run.isErr()) {
        res.status(500).end();
        return;
      }

      res.status(200).json({ run: run.value.run });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
