import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession } from "@app/lib/auth";
import { checkDatasetData } from "@app/lib/datasets";
import { DustAPI } from "@app/lib/dust_api";
import { Dataset } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";
import { DatasetType } from "@app/types/dataset";
import { NextApiRequest, NextApiResponse } from "next";

type GetDatasetResponseBody = { dataset: DatasetType };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDatasetResponseBody>
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

  let [dataset] = await Promise.all([
    Dataset.findOne({
      where: {
        workspaceId: owner.id,
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

      // Register dataset with the Dust internal API.
      const d = await DustAPI.createDataset(
        app.dustAPIProjectId,
        req.body.name,
        data
      );
      if (d.isErr()) {
        res.status(500).end();
        return;
      }

      let description = req.body.description ? req.body.description : null;

      await dataset.update({
        name: req.body.name,
        description,
      });

      res.status(200).json({
        dataset: {
          name: req.body.name,
          description,
        },
      });
      return;

    case "DELETE":
      if (!auth.isBuilder()) {
        res.status(404).end();
        return;
      }

      await Dataset.destroy({
        where: {
          workspaceId: owner.id,
          appId: app.id,
          name: dataset.name,
        },
      });

      res.status(200).json({
        dataset: {
          name: dataset.name,
          description: dataset.description,
        },
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
