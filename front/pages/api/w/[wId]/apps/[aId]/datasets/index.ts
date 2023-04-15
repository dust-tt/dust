import { getApp } from "@app/lib/api/app";
import { getDatasets } from "@app/lib/api/datasets";
import { Authenticator, getSession } from "@app/lib/auth";
import { checkDatasetData } from "@app/lib/datasets";
import { DustAPI } from "@app/lib/dust_api";
import { Dataset } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";
import { DatasetType } from "@app/types/dataset";
import { NextApiRequest, NextApiResponse } from "next";

export type GetDatasetsResponseBody = {
  datasets: DatasetType[];
};

export type PostDatasetResponseBody = {
  dataset: DatasetType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDatasetsResponseBody | PostDatasetResponseBody>
): Promise<void> {
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

  switch (req.method) {
    case "GET":
      const datasets = await getDatasets(auth, app);

      res.status(200).json({
        datasets,
      });
      return;

    case "POST":
      if (!auth.isBuilder()) {
        res.status(404).end();
        return;
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !Array.isArray(req.body.data)
      ) {
        res.status(400).end();
        return;
      }

      // Check that dataset does not already exist.
      let existing = await Dataset.findAll({
        where: {
          workspaceId: owner.id,
          appId: app.internalId,
        },
        attributes: ["name"],
      });

      let exists = false;
      existing.forEach((e) => {
        if (e.name == req.body.name) {
          exists = true;
        }
      });
      if (exists) {
        res.status(400).end();
        return;
      }

      // Check data validity.
      try {
        checkDatasetData(req.body.data);
      } catch (e) {
        res.status(400).end();
        return;
      }

      // Reorder all keys as Dust API expects them ordered.
      let data = req.body.data.map((d: any) => {
        return Object.keys(d)
          .sort()
          .reduce((obj: { [key: string]: any }, key) => {
            obj[key] = d[key];
            return obj;
          }, {});
      });

      const dataset = await DustAPI.createDataset(
        app.dustAPIProjectId,
        req.body.name,
        data
      );
      if (dataset.isErr()) {
        res.status(500).end();
        return;
      }

      let description = req.body.description ? req.body.description : null;

      await Dataset.create({
        name: req.body.name,
        description,
        appId: app.internalId,
        workspaceId: owner.id,
      });

      res.status(201).json({
        dataset: {
          name: req.body.name,
          description,
        },
      });
      return;

    default:
      res.status(405).end();
      break;
  }
}

export default withLogging(handler);
