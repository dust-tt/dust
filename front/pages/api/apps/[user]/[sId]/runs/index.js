import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { User, App, Provider } from "@app/lib/models";
import { dumpSpecification } from "@app/lib/specification";
import { credentialsFromProviders } from "@app/lib/providers";
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
        return;
      }
      return postHandler(req, res, app, user);

    case "GET":
      return getHandler(req, res, app);

    default:
      res.status(405).end();
      return;
  }
}

async function getHandler(req, res, app) {
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
    return;
  }

  const runs = await runsRes.json();

  res
    .status(200)
    .json({ runs: runs.response.runs, total: runs.response.total });
}

async function postHandler(req, res, app, user) {
  switch (req.body.mode) {
    case "execute":
      return executeModeHandler(req, res, app, user);
    case "design":
      return designModeHandler(req, res, app, user);
    default:
      res.status(400).end();
      return;
  }
}

async function executeModeHandler(req, res, app, user) {
  if (
    !req.body ||
    !(typeof req.body.config == "string") ||
    !(typeof req.body.specificationHash === "string")
  ) {
    res.status(400).end();
    return;
  }

  const [providers] = await Promise.all([
    Provider.findAll({
      where: {
        userId: user.id,
      },
    }),
  ]);

  const runRes = await fetch(
    `${DUST_API}/projects/${app.dustAPIProjectId}/runs/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_type: "local",
        specification_hash: req.body.specificationHash,
        inputs: req.body.inputs,
        config: { blocks: JSON.parse(req.body.config) },
        credentials: credentialsFromProviders(providers),
      }),
    }
  );

  if (!runRes.ok) {
    const error = await runRes.json();
    res.status(400).json(error.error);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    for await (const chunk of runRes.body) {
      res.write(chunk);
      res.flush();
    }
  } catch (e) {
    console.log("ERROR streaming from Dust API", e);
  }
  res.end();
  return;
}

async function designModeHandler(req, res, app, user) {
  let [providers] = await Promise.all([
    Provider.findAll({
      where: {
        userId: user.id,
      },
    }),
  ]);

  if (
    !req.body ||
    !(typeof req.body.config == "string") ||
    !(typeof req.body.specification === "string")
  ) {
    res.status(400).end();
    return;
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
    return;
  }

  let latestDatasets = {};
  for (const d in datasets.response.datasets) {
    latestDatasets[d] = datasets.response.datasets[d][0].hash;
  }

  const config = JSON.parse(req.body.config);
  const { dataset: inputDataset } = Object.values(config).find(
    (configValue) => configValue.type == "input"
  );

  const runRes = await fetch(
    `${DUST_API}/projects/${app.dustAPIProjectId}/runs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_type: "local",
        specification: dumpSpecification(
          JSON.parse(req.body.specification),
          latestDatasets
        ),
        dataset_id: inputDataset,
        config: { blocks: config },
        credentials: credentialsFromProviders(providers),
      }),
    }
  );

  if (!runRes.ok) {
    const error = await runRes.json();
    res.status(400).json(error.error);
    return;
  }

  const run = await runRes.json();

  await app.update({
    savedSpecification: req.body.specification,
    savedConfig: req.body.config,
    savedRun: run.response.run.run_id,
  });

  res.status(200).json({ run: run.response.run });

  return;
}
