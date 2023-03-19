import { unstable_getServerSession } from 'next-auth/next';
import { authOptions } from '@app/pages/api/auth/[...nextauth]';
import { User, App, Dataset } from '@app/lib/models';
import { checkDatasetData } from '@app/lib/datasets';

const { DUST_API } = process.env;

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).end();
    return;
  }
  let user = await User.findOne({
    where: {
      githubId: session.provider.id.toString(),
    },
  });
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

  let [dataset] = await Promise.all([
    Dataset.findOne({
      where: {
        userId: user.id,
        appId: app.id,
        name: req.query.name,
      },
    }),
  ]);

  switch (req.method) {
    case "GET":
      if (!dataset) {
        res.status(404).end();
        break;
      }

      // Retrieve latest dataset data
      res.status(200).json({ dataset });
      break;

    case "POST":
      if (!dataset) {
        res.status(404).end();
        break;
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

      // Check data validity.
      try {
        checkDatasetData(req.body.data);
      } catch (e) {
        res.status(400).end();
        break;
      }

      // Reorder all keys as Dust API expects them ordered.
      let data = req.body.data.map((d) => {
        return Object.keys(d)
          .sort()
          .reduce((obj, key) => {
            obj[key] = d[key];
            return obj;
          }, {});
      });
      // console.log("DATASET UPLOAD", data);

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
      if (!dataset) {
        res.status(404).end();
        break;
      }

      await Dataset.destroy({
        where: {
          userId: user.id,
          appId: app.id,
          name: req.query.name,
        },
      });

      res.status(200).json({
        dataset: {
          name: req.body.name,
        },
      });
      break;

    default:
      res.status(405).end();
      break;
  }
}
