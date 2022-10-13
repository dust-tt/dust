import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../../../auth/[...nextauth]";
import { User, App, Dataset } from "../../../../../../../../lib/models";

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
            visibility: "public",
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

  let [dataset] = await Promise.all([
    Dataset.findOne({
      where: {
        userId: user.id,
        appId: app.id,
        name: req.query.name,
      },
      attributes: ["id", "name", "description"],
    }),
  ]);

  if (!dataset) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let hash = req.query.hash;

      // Translate latest if needed.

      if (req.query.hash == "latest") {
        const apiDatasetsRes = await fetch(
          `${DUST_API}/projects/${app.dustAPIProjectId}/datasets`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        const apiDatasets = await apiDatasetsRes.json();

        if (!(dataset.name in apiDatasets.response.datasets)) {
          res.status(404).end();
          break;
        }
        if (apiDatasets.response.datasets[dataset.name].lenght == 0) {
          res.status(400).end();
          break;
        }

        hash = apiDatasets.response.datasets[dataset.name][0].hash;
      }

      const apiDatasetRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/datasets/${dataset.name}/${hash}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const apiDataset = await apiDatasetRes.json();

      res.status(200).json({
        dataset: {
          name: dataset.name,
          description: dataset.description,
          data: JSON.stringify(apiDataset.response.dataset.data, null, 2),
        },
      });
      break;

    default:
      res.status(405).end();
      break;
  }
}
