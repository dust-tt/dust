import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]";
import { User, App, Provider } from "../../../../../../lib/models";
import { dumpSpecification } from "../../../../../../lib/specification";
import { credentialsFromProviders } from "../../../../../../lib/providers";
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

  const readOnly = !(session && session.provider.id.toString() === user.githubId);

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
    }),
  ]);

  if (!app) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "POST":
      if (readOnly) {
        res.status(401).end();
        break;
      }

      let [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: user.id,
          },
        }),
      ]);

      if (
        !req.body ||
        !(typeof req.body.specification == "string") ||
        !(typeof req.body.config == "string")
      ) {
        res.status(400).end();
        break;
      }

      const datasetsRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/datasets`,
        {
          method: "GET",
        }
      );
      const datasets = await datasetsRes.json();
      if (datasets.error) {
        res.status(500).end();
        break;
      }

      let latestDatasets = {};
      for (const d in datasets.response.datasets) {
        latestDatasets[d] = datasets.response.datasets[d][0].hash;
      }
      let spec = dumpSpecification(
        JSON.parse(req.body.specification),
        latestDatasets
      );

      let config = JSON.parse(req.body.config);
      let inputDataset = null;
      for (const name in config) {
        const c = config[name];
        if (c.type == "input") {
          inputDataset = c.dataset;
        }
      }

      let credentials = credentialsFromProviders(providers);

      // console.log(spec);
      // console.log(config);
      // console.log(inputDataset);
      // console.log(credentials);

      const runRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            run_type: "local",
            specification: spec,
            dataset_id: inputDataset,
            config: { blocks: config },
            credentials,
          }),
        }
      );

      if (!runRes.ok) {
        const error = await runRes.json();
        res.status(400).json(error.error);
        break;
      }

      const run = await runRes.json();

      await app.update({
        savedSpecification: req.body.specification,
        savedConfig: req.body.config,
        savedRun: run.response.run.run_id,
      });

      res.status(200).json({ run: run.response.run });
      break;

    case "GET":
      let limit = req.query.limit ? parseInt(req.query.limit) : 10;
      let offset = req.query.offset ? parseInt(req.query.offset) : 0;
      let runType = req.query.runType ? req.query.runType : "local";

      const runsRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs?limit=${limit}&offset=${offset}&run_type=${runType}`,
        {
          method: "GET",
        }
      );

      if (!runsRes.ok) {
        const error = await runsRes.json();
        res.status(400).json(error.error);
        break;
      }

      const runs = await runsRes.json();

      res
        .status(200)
        .json({ runs: runs.response.runs, total: runs.response.total });
      break;

    default:
      res.status(405).end();
      break;
  }
}
