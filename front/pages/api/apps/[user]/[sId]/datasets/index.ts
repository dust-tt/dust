import { checkDatasetData } from "@app/lib/datasets";
import { App, Dataset, User } from "@app/lib/models";
import { NextApiRequest, NextApiResponse } from "next";
import withLogging from "@app/logger/withlogging";
import { DatasetType } from "@app/types/dataset";
import { auth_user } from "@app/lib/auth";

const { DUST_API } = process.env;

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

  switch (req.method) {
    case "GET":
      if (!auth.canReadApp(app)) {
        res.status(404).end();
        return;
      }

      let datasets = await Dataset.findAll({
        where: {
          userId: appUser.id,
          appId: app.id,
        },
        order: [["updatedAt", "DESC"]],
        attributes: ["id", "name", "description"],
      });

      res.status(200).json({
        datasets: datasets.map((d) => {
          return {
            name: d.name,
            description: d.description,
          };
        }),
      });
      return;

    case "POST":
      if (!auth.canEditApp(app)) {
        res.status(401).end();
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
          userId: appUser.id,
          appId: app.id,
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

      // Register dataset with the Dust internal API.
      const r = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/datasets`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dataset_id: req.body.name,
            data,
          }),
        }
      );
      const d = await r.json();
      if (d.error) {
        res.status(500).end();
        return;
      }

      let description = req.body.description ? req.body.description : null;

      await Dataset.create({
        name: req.body.name,
        description,
        userId: appUser.id,
        appId: app.id,
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
