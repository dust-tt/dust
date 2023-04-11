import { auth_user } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { App, User } from "@app/lib/models";
import { dumpSpecification } from "@app/lib/specification";
import withLogging from "@app/logger/withlogging";
import { AppType } from "@app/types/app";
import { NextApiRequest, NextApiResponse } from "next";

export type GetSpecificationResponseBody = {
  app: AppType;
  specification: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetSpecificationResponseBody>
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
    res.status(authRes.error.status_code).end();
    return;
  }
  let auth = authRes.value;

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

  switch (req.method) {
    case "GET":
      if (!auth.canReadApp(app)) {
        res.status(404).end();
        return;
      }

      const datasets = await DustAPI.getDatasets(app.dustAPIProjectId);
      if (datasets.isErr()) {
        res.status(500).end();
        return;
      }

      let latestDatasets = {} as { [key: string]: string };
      for (const d in datasets.value.datasets) {
        latestDatasets[d] = datasets.value.datasets[d][0].hash;
      }

      let spec = dumpSpecification(
        JSON.parse(app.savedSpecification || "[]"),
        latestDatasets
      );

      res.status(200).json({ app, specification: spec });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
