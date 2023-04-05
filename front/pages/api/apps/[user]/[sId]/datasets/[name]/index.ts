import { NextApiRequest, NextApiResponse } from "next";
import { auth_user } from "@app/lib/auth";
import { User, App, Dataset } from "@app/lib/models";
import { checkDatasetData } from "@app/lib/datasets";
import withLogging from "../../../../../../../logger/withlogging";
import { DatasetType } from "@app/lib/types";

const { DUST_API } = process.env;

type GetDatasetResponseBody = { dataset: DatasetType };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDatasetResponseBody>
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

      // TODO(spolu) very likely this route is unused

      res.status(200).json({
        dataset: {
          name: dataset.name,
          description: dataset.description,
        },
      });
      break;

    case "POST":
      if (!auth.canEditApp(app)) {
        return res.status(404).end();
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !Array.isArray(req.body.data)
      ) {
        return res.status(400).end();
      }

      // Check data validity.
      try {
        checkDatasetData(req.body.data);
      } catch (e) {
        return res.status(400).end();
      }

      // Reorder all keys as Dust API expects them ordered.
      let data = req.body.data.map((d: any) => {
        return Object.keys(d)
          .sort()
          .reduce((obj: any, key) => {
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
        break;
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
      break;

    case "DELETE":
      if (!auth.canEditApp(app)) {
        return res.status(404).end();
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
      break;

    default:
      return res.status(405).end();
  }
}

export default withLogging(handler);
