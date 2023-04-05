import { NextApiRequest, NextApiResponse } from "next";
import { auth_user } from "@app/lib/auth";
import { User, App, Dataset } from "@app/lib/models";
import { checkDatasetData } from "@app/lib/datasets";
import withLogging from "../../../../../../../logger/withlogging";
import { DatasetType } from "@app/types/dataset";

const { DUST_API } = process.env;

type GetDatasetResponseBody = { dataset: DatasetType };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDatasetResponseBody>
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

      // TODO(spolu) very likely this route is unused

      res.status(200).json({
        dataset: {
          name: dataset.name,
          description: dataset.description,
        },
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
      if (!auth.canEditApp(app)) {
        res.status(401).end();
        return;
      }

      await Dataset.destroy({
        where: {
          userId: appUser.id,
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
