import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { User, App, Dataset } from "../../../../../lib/models";
import { checkDatasetData } from "../../../../../lib/datasets";

const { DUST_API } = process.env;

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).end();
    return;
  }

  let [user] = await Promise.all([
    User.findOne({
      where: {
        githubId: session.github.id,
      },
    }),
  ]);
  if (!user) {
    res.status(401).end();
    return;
  }

  let [app] = await Promise.all([
    App.findOne({
      where: {
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
    res.status(400).end();
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
      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !(typeof req.body.data == "string")
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
        checkDatasetData(req.body.data);
      } catch (e) {
        res.status(400).end();
        break;
      }

      let data = JSON.parse(req.body.data);

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

      res.status(200).json({
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
