import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]";
import { User, App, Provider } from "../../../../../../lib/models";
import { dumpSpecification } from "../../../../../../lib/specification";
import { credentialsFromProviders } from "../../../../../../lib/providers";

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
    res.status(404).end();
    return;
  }

  let [app, providers] = await Promise.all([
    App.findOne({
      where: {
        userId: user.id,
        sId: req.query.sId,
      },
    }),
    Provider.findAll({
      where: {
        userId: user.id,
      },
    }),
  ]);

  if (!app) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "POST":
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

    default:
      res.status(405).end();
      break;
  }
}
