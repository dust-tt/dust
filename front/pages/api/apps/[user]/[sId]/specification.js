import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { User, App } from "@app/lib/models";
import { dumpSpecification } from "@app/lib/specification";
import { Op } from "sequelize";
import withLogging from "@app/logger/withlogging";

const { DUST_API } = process.env;

async function handler(req, res) {
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

  let app = await App.findOne({
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
  });

  if (!app) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      const datasetsRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/datasets`,
        {
          method: "GET",
        }
      );
      const datasets = await datasetsRes.json();
      if (datasets.error) {
        res.status(500).end();
        return;
      }

      let latestDatasets = {};
      for (const d in datasets.response.datasets) {
        latestDatasets[d] = datasets.response.datasets[d][0].hash;
      }

      let spec = dumpSpecification(
        JSON.parse(app.savedSpecification),
        latestDatasets
      );

      res.status(200).json({ app, specification: spec });
      break;

    default:
      res.status(405).end();
      break;
  }
}

export default withLogging(handler);
