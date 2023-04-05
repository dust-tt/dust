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
) {
  let [authRes, appUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    return res.status(authRes.error().status_code).end();
  }
  let auth = authRes.value();

  if (!appUser) {
    return res.status(404).end();
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
    return res.status(404).end();
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
    return res.status(404).end();
  }

  switch (req.method) {
    case "GET":
      if (!auth.canReadApp(app)) {
        return res.status(404).end();
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
          return res.status(404).end();
        }
        if (apiDatasets.response.datasets[dataset.name].lenght == 0) {
          return res.status(400).end();
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
      break;

    default:
      return res.status(405).end();
  }
}

export default withLogging(handler);
