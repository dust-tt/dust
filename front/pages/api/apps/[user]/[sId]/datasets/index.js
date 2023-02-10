import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]";
import { User, App, Dataset } from "../../../../../../lib/models";
import { checkDatasetData } from "../../../../../../lib/datasets";
import { Op } from "sequelize";

const { DUST_API } = process.env;

export default async function handler(req, res) {
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

  const readOnly = !(session && session.github.id.toString() === user.githubId);

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

      res.status(200).json({ datasets });
      break;

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
        break;
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
        break;
      }

      // Check data validity.
      try {
        checkDatasetData(req.body.data, false);
      } catch (e) {
        res.status(400).end();
        break;
      }

      // Reorder all keys as Dust API expects them ordered.
      let data = req.body.data.map((d) => {
        return JSON.parse(JSON.stringify(d, Object.keys(d).sort()));
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
        break;
      }

      let description = req.body.description ? req.body.description : null;

      let dataset = await Dataset.create({
        name: req.body.name,
        description,
        userId: user.id,
        appId: app.id,
      });

      res.status(201).json({
        dataset: {
          name: req.body.name,
          description,
        },
      });
      break;

    default:
      res.status(405).end();
      break;
  }
}
