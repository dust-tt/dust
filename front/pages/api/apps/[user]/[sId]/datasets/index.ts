import { checkDatasetData } from "@app/lib/datasets";
import { App, Dataset, User } from "@app/lib/models";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { NextApiRequest, NextApiResponse } from "next";
import { unstable_getServerSession } from "next-auth/next";
import { Op } from "sequelize";
import withLogging from "@app/logger/withlogging";

const { DUST_API } = process.env;

type DatasetObject = {
  id: number;
  name: string;
  description: string;
};

export type GetDatasetResponseBody = {
  datasets: DatasetObject[];
};

export type PostDatasetResponseBody = {
  dataset: DatasetObject;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDatasetResponseBody | PostDatasetResponseBody>
): Promise<void> {
  const session = await unstable_getServerSession(req, res, authOptions);

  let user = await User.findOne({
    where: {
      username: req.query.user,
    },
  });

  if (!user) {
    res.status(404).end();
    return;
  }

  const readOnly = !(
    session && session.provider.id.toString() === user.githubId
  );

  let [app] = await Promise.all([
    App.findOne({
      where: readOnly
        ? {
            userId: user.id,
            sId: req.query.sId,
            visibility: {
              [Op.or]: ["public", "unlisted"],
            },
          }
        : {
            userId: user.id,
            sId: req.query.sId,
          },
      attributes: [
        "id",
        "uId",
        "sId",
        "name",
        "description",
        "visibility",
        "savedSpecification",
        "updatedAt",
        "dustAPIProjectId",
      ],
    }),
  ]);

  if (!app) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let datasets = await Dataset.findAll({
        where: {
          userId: user.id,
          appId: app.id,
        },
        order: [["updatedAt", "DESC"]],
        attributes: ["id", "name", "description"],
      });

      res.status(200).json({ datasets } as GetDatasetResponseBody);
      return;

    case "POST":
      if (readOnly) {
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
          userId: user.id,
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
      //console.log("DATASET UPLOAD", data);

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

      const { id: datasetId } = await Dataset.create({
        name: req.body.name,
        description,
        userId: user.id,
        appId: app.id,
      });

      res.status(201).json({
        dataset: {
          id: datasetId,
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
