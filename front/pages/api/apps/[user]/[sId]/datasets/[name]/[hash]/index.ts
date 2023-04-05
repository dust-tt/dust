import { NextApiRequest, NextApiResponse } from "next";
import { auth_user } from "@app/lib/auth";
import { User, App, Dataset } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { DatasetType } from "@app/lib/types";

const { DUST_API } = process.env;

type GetDatasetByHashResponseBody = { dataset: DatasetType };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDatasetByHashResponseBody>
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

  let [dataset] = await Promise.all([
    Dataset.findOne({
      where: {
        userId: appUser.id,
        appId: app.id,
        name: req.query.name,
      },
    }),
  ]);

  if (!dataset) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      if (!auth.canReadApp(app)) {
        res.status(404).end();
        return;
      }

      let hash = req.query.hash;

      // Translate latest if needed.
      if (req.query.hash == "latest") {
        const apiDatasetsRes = await fetch(
          `${DUST_API}/projects/${app.dustAPIProjectId}/datasets`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        const apiDatasets = await apiDatasetsRes.json();

        if (!(dataset.name in apiDatasets.response.datasets)) {
          res.status(404).end();
          return;
        }
        if (apiDatasets.response.datasets[dataset.name].lenght == 0) {
          res.status(400).end();
          return;
        }

        hash = apiDatasets.response.datasets[dataset.name][0].hash;
      }

      const apiDatasetRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/datasets/${dataset.name}/${hash}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const apiDataset = await apiDatasetRes.json();

      res.status(200).json({
        dataset: {
          name: dataset.name,
          description: dataset.description,
          data: apiDataset.response.dataset.data,
        },
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
