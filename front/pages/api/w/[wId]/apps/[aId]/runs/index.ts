import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { App, Provider, Run } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";
import { withLogging } from "@app/logger/withlogging";
import { RunType } from "@app/types/run";
import { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

export type GetRunsResponseBody = {
  runs: RunType[];
  total: number;
};

type GetRunsErrorResponseBody = {
  message: string;
  code: string;
};

export type PostRunsResponseBody = {
  run: RunType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetRunsResponseBody | GetRunsErrorResponseBody | PostRunsResponseBody
  >
) {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).end();
    return;
  }

  let app = await App.findOne({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private", "unlisted"],
          },
          sId: req.query.aId,
        }
      : {
          workspaceId: owner.id,
          // Do not include 'unlisted' here.
          visibility: "public",
          sId: req.query.aId,
        },
  });

  if (!app) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "POST":
      // Only the users that are `builders` for the current workspace can create runs.
      if (!auth.isBuilder()) {
        res.status(404).end();
        return;
      }

      const [providers] = await Promise.all([
        Provider.findAll({
          where: {
            workspaceId: owner.id,
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

          const streamRes = await DustAPI.createRunStream(
            app.dustAPIProjectId,
            owner,
            {
              runType: "execute",
              specificationHash: req.body.specificationHash,
              inputs: req.body.inputs,
              config: { blocks: JSON.parse(req.body.config) },
              credentials: credentialsFromProviders(providers),
            }
          );

          if (streamRes.isErr()) {
            res.status(400).json(streamRes.error);
            return;
          }

          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          try {
            for await (const chunk of streamRes.value.chunkStream) {
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

          let dustRunId: string;
          try {
            dustRunId = await streamRes.value.dustRunId;
          } catch (e) {
            logger.error(
              {
                error:
                  "No run ID received from Dust API after consuming stream",
              },
              "Error streaming from Dust API"
            );
            res.end();
            return;
          }

          Run.create({
            dustRunId,
            appId: app.id,
            runType: "execute",
            workspaceId: owner.id,
          });

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

          const datasets = await DustAPI.getDatasets(app.dustAPIProjectId);
          if (datasets.isErr()) {
            res.status(500).end();
            return;
          }

          let latestDatasets: { [key: string]: string } = {};
          for (const d in datasets.value.datasets) {
            latestDatasets[d] = datasets.value.datasets[d][0].hash;
          }

          const config = JSON.parse(req.body.config);
          const inputConfigEntry: any = Object.values(config).find(
            (configValue: any) => configValue.type == "input"
          );
          const inputDataset = inputConfigEntry
            ? inputConfigEntry.dataset
            : null;

          const dustRun = await DustAPI.createRun(app.dustAPIProjectId, owner, {
            runType: "local",
            specification: dumpSpecification(
              JSON.parse(req.body.specification),
              latestDatasets
            ),
            datasetId: inputDataset,
            config: { blocks: config },
            credentials: credentialsFromProviders(providers),
          });

          if (dustRun.isErr()) {
            res.status(400).json(dustRun.error);
            return;
          }

          Run.create({
            dustRunId: dustRun.value.run.run_id,
            appId: app.id,
            runType: "local",
            workspaceId: owner.id,
          });

          await app.update({
            savedSpecification: req.body.specification,
            savedConfig: req.body.config,
            savedRun: dustRun.value.run.run_id,
          });

          res.status(200).json({ run: dustRun.value.run });
          return;

        default:
          res.status(400).end();
          return;
      }

    case "GET":
      if (!auth.isUser()) {
        res.status(404).end();
        return;
      }

      let limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      let offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      let runType = req.query.runType ? req.query.runType : "local";

      const where = {
        runType,
        workspaceId: owner.id,
        appId: app.id,
      };

      const userRuns = await Run.findAll({
        where: where,
        limit,
        offset,
        order: [["createdAt", "DESC"]],
      });
      const totalNumberOfRuns = await Run.count({
        where,
      });
      const userDustRunIds = userRuns.map((r) => r.dustRunId);

      const dustRuns = await DustAPI.getRunsBatch(
        app.dustAPIProjectId,
        userDustRunIds
      );

      if (dustRuns.isErr()) {
        console.log(dustRuns.error);
        res.status(400).json(dustRuns.error);
        return;
      }

      res.status(200).json({
        runs: userDustRunIds.map((dustRunId) => dustRuns.value.runs[dustRunId]),
        total: totalNumberOfRuns,
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
