import { auth_user } from "@app/lib/auth";
import { DustAPI, isErrorResponse } from "@app/lib/dust_api";
import { parse_payload } from "@app/lib/http_utils";
import { App, Dataset, User } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { DatasetType } from "@app/types/dataset";
import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

const { DUST_API } = process.env;

type GetDatasetByHashResponseBody = { dataset: DatasetType };

type GetDatasetQuery = {
  hash: string;
  user: string;
  sId: string;
  name: string;
};

const getDatasetQuerySchema: JSONSchemaType<GetDatasetQuery> = {
  type: "object",
  properties: {
    hash: { type: "string" },
    user: { type: "string" },
    sId: { type: "string" },
    name: { type: "string" },
  },
  required: ["hash", "user", "sId", "name"],
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDatasetByHashResponseBody>
): Promise<void> {
  const getDatasetQueryRes = parse_payload(getDatasetQuerySchema, req.query);

  if (getDatasetQueryRes.isErr()) {
    res.status(400).end();
    return;
  }

  const getDatasetQuery = getDatasetQueryRes.value();

  let [authRes, appUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: getDatasetQuery.user,
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
        sId: getDatasetQuery.sId,
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
        name: getDatasetQuery.name,
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

      let hash = getDatasetQuery.hash;

      // Translate latest if needed.
      if (req.query.hash == "latest") {
        const apiDatasets = await DustAPI.getDatasets(app.dustAPIProjectId);

        if (isErrorResponse(apiDatasets)) {
          res.status(500).end();
          return;
        }

        if (!(dataset.name in apiDatasets.response.datasets)) {
          res.status(404).end();
          return;
        }
        if (apiDatasets.response.datasets[dataset.name].length == 0) {
          res.status(400).end();
          return;
        }

        hash = apiDatasets.response.datasets[dataset.name][0].hash;
      }

      const apiDataset = await DustAPI.getDataset(
        app.dustAPIProjectId,
        dataset.name,
        hash
      );

      if (isErrorResponse(apiDataset)) {
        res.status(500).end();
        return;
      }

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
