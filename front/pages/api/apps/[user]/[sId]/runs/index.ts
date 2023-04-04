import { App, Provider, User } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { dumpSpecification } from "@app/lib/specification";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { Run } from "@app/types/run";
import { NextApiRequest, NextApiResponse } from "next";
import { unstable_getServerSession } from "next-auth/next";
import { Op } from "sequelize";
import { streamChunks } from "@app/lib/http_utils";
import withLogging from "@app/logger/withlogging";

const { DUST_API } = process.env;

export type GetRunsResponseBody = {
  runs: Run[];
  total: number;
};

export type PostRunsResponseBody = {
  run: Run;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetRunsResponseBody | PostRunsResponseBody>
) {
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
      // Super important check as this would allow other users to run public app with the owner
      // credentials. We will allow that in the future but the how the credentials are pulled will
      // nede to be updated.
      if (readOnly) {
        res.status(401).end();
        break;
      }

      const [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: user.id,
          },
        }),
      ]);

      switch (req.body.mode) {
        // Run creation as part of the app execution process (Use pane).
        case "execute":
          if (
            !req.body ||
            !(typeof req.body.config == "string") ||
            !(typeof req.body.specificationHash === "string")
          ) {
            res.status(400).end();
            return;
          }

          const streamRes = await fetch(
            `${DUST_API}/projects/${app.dustAPIProjectId}/runs/stream`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Dust-User-Id": user.id.toString(),
              },
              body: JSON.stringify({
                run_type: "execute",
                specification_hash: req.body.specificationHash,
                inputs: req.body.inputs,
                config: { blocks: JSON.parse(req.body.config) },
                credentials: credentialsFromProviders(providers),
              }),
            }
          );

          if (!streamRes.ok || !streamRes.body) {
            const error = await streamRes.json();
            res.status(400).json(error.error);
            return;
          }

          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          try {
            for await (const chunk of streamChunks(streamRes.body)) {
              res.write(chunk);
              // @ts-expect-error
              res.flush();
            }
          } catch (e) {
            console.log("ERROR streaming from Dust API", e);
          }
          res.end();
          return;

        // Run creation as part of the app design process (Specification pane).
        case "design":
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

          let latestDatasets: { [key: string]: string } = {};
          for (const d in datasets.response.datasets) {
            latestDatasets[d] = datasets.response.datasets[d][0].hash;
          }

          const config = JSON.parse(req.body.config);
          const inputConfigEntry: any = Object.values(config).find(
            (configValue: any) => configValue.type == "input"
          );
          const inputDataset = inputConfigEntry
            ? inputConfigEntry.dataset
            : null;

          const runRes = await fetch(
            `${DUST_API}/projects/${app.dustAPIProjectId}/runs`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Dust-User-Id": user.id.toString(),
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
        default:
          res.status(400).end();
          return;
      }

    case "GET":
      let limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      let offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
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
      break;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);