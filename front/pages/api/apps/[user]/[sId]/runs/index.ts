import { auth_user } from "@app/lib/auth";
import { streamChunks } from "@app/lib/http_utils";
import { App, Provider, User } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";
import withLogging from "@app/logger/withlogging";
import { RunType } from "@app/types/run";
import { NextApiRequest, NextApiResponse } from "next";

const { DUST_API } = process.env;

export type GetRunsResponseBody = {
  runs: RunType[];
  total: number;
};

export type PostRunsResponseBody = {
  run: RunType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetRunsResponseBody | PostRunsResponseBody>
) {
  let [authRes, appUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    res.status(authRes.error.status_code).end();
    return;
  }
  let auth = authRes.value;

  if (!appUser) {
    res.status(404).end();
    return;
  }

  let [app] = await Promise.all([
    App.findOne({
      where: {
        userId: appUser.id,
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
      // Super important check as this would allow other users to run public app as their own (we do
      // pull the right credentials from the auth user), but the resulting run object (`core`) would
      // be visible by the owner of the app, leaking information both ways. We will allow that in
      // the future once we introduce a `front` `Run` object.
      if (!auth.canRunApp(app)) {
        res.status(404).end();
        return;
      }

      const [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: auth.user().id,
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
                "X-Dust-User-Id": auth.user().id.toString(),
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
            logger.error(
              {
                error: e,
              },
              "Error streaming from Dust API"
            );
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
                "X-Dust-User-Id": auth.user().id.toString(),
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
      // We enforce canRunApp here as we don't want public app's owner Runs to be leaked. In the
      // future with a `front` `Run` object we'll be able to display the run of any user on other's
      // apps Logs panel.
      if (!auth.canRunApp(app)) {
        res.status(404).end();
        return;
      }

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
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
