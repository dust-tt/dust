import type { RunType, WithAPIErrorResponse } from "@dust-tt/types";
import { credentialsFromProviders } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import config from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { App, Provider } from "@app/lib/models/apps";
import { RunResource } from "@app/lib/resources/run_resource";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetRunsResponseBody = {
  runs: RunType[];
  total: number;
};

export type PostRunsResponseBody = {
  run: RunType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetRunsResponseBody | PostRunsResponseBody>
  >,
  auth: Authenticator,
  session: SessionWithUser
) {
  let owner = auth.getNonNullableWorkspace();

  const app = await getApp(auth, req.query.aId as string);

  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  switch (req.method) {
    case "POST":
      // Only the users that are `builders` for the current workspace can create runs.
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can create runs.",
          },
        });
      }

      const [providers, secrets] = await Promise.all([
        Provider.findAll({
          where: {
            workspaceId: owner.id,
          },
        }),
        getDustAppSecrets(auth, true),
      ]);

      if (
        !req.body ||
        !(typeof req.body.config == "string") ||
        !(typeof req.body.specification === "string")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { config: string, specificationHash: string }.",
          },
        });
      }

      const datasets = await coreAPI.getDatasets({
        projectId: app.dustAPIProjectId,
      });
      if (datasets.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Datasets retrieval failed.",
            app_error: datasets.error,
          },
        });
      }

      const latestDatasets: { [key: string]: string } = {};
      for (const d in datasets.value.datasets) {
        latestDatasets[d] = datasets.value.datasets[d][0].hash;
      }

      const config = JSON.parse(req.body.config);
      const inputConfigEntry: any = Object.values(config).find(
        (configValue: any) => configValue.type == "input"
      );
      const inputDataset = inputConfigEntry ? inputConfigEntry.dataset : null;

      const dustRun = await coreAPI.createRun({
        projectId: app.dustAPIProjectId,
        runAsWorkspaceId: owner.sId,
        runType: "local",
        specification: dumpSpecification(
          JSON.parse(req.body.specification),
          latestDatasets
        ),
        datasetId: inputDataset,
        config: { blocks: config },
        credentials: credentialsFromProviders(providers),
        secrets,
      });

      if (dustRun.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "run_error",
            message: "Run creation failed.",
            run_error: dustRun.error,
          },
        });
      }

      await Promise.all([
        RunResource.makeNew({
          dustRunId: dustRun.value.run.run_id,
          appId: app.id,
          runType: "local",
          workspaceId: owner.id,
        }),
        App.update(
          {
            savedSpecification: req.body.specification,
            savedConfig: req.body.config,
            savedRun: dustRun.value.run.run_id,
          },
          {
            where: {
              id: app.id,
            },
          }
        ),
      ]);

      res.status(200).json({ run: dustRun.value.run });
      return;

    case "GET":
      if (req.query.wIdTarget) {
        // If we have a `wIdTarget` query parameter, we are fetching runs that were created with an
        // API key coming from another workspace. So we override the `owner` variable and check that
        // the user is a user of that workspace.

        // Dust super users can view runs of any workspace.
        let target = await Authenticator.fromSuperUserSession(
          session,
          req.query.wIdTarget as string
        );
        if (!target.isAdmin()) {
          // If the user is not a super user, we check that the user is a user of the target
          target = await Authenticator.fromSession(
            session,
            req.query.wIdTarget as string
          );
        }

        const targetOwner = target.workspace();
        if (!targetOwner) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "app_not_found",
              message: "The app was not found.",
            },
          });
        }

        owner = targetOwner;

        if (!target.isUser()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "app_not_found",
              message: "The app was not found.",
            },
          });
        }
      } else {
        // Otherwise we are retrieving the runs for the app's own workspace let's just check that we
        // are user of that workspace.
        if (!auth.isUser()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "app_not_found",
              message: "The app was not found.",
            },
          });
        }
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;
      const runType = req.query.runType ? req.query.runType : "local";

      const userRuns = await RunResource.listByAppAndRunType(
        owner,
        { appId: app.id, runType },
        { limit, offset }
      );

      const totalNumberOfRuns = await RunResource.countByAppAndRunType(owner, {
        appId: app.id,
        runType,
      });
      const userDustRunIds = userRuns.map((r) => r.dustRunId);

      const dustRuns = await coreAPI.getRunsBatch({
        projectId: app.dustAPIProjectId,
        dustRunIds: userDustRunIds,
      });

      if (dustRuns.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Runs retrieval failed.",
            app_error: dustRuns.error,
          },
        });
      }

      res.status(200).json({
        runs: userDustRunIds.map((dustRunId) => dustRuns.value.runs[dustRunId]),
        total: totalNumberOfRuns,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
