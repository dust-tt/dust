import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AppResource } from "@app/lib/resources/app_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Provider } from "@app/lib/resources/storage/models/apps";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { RunType, WithAPIErrorResponse } from "@app/types";
import { CoreAPI, credentialsFromProviders } from "@app/types";

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
  { space }: { space: SpaceResource },
  session: SessionWithUser
) {
  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  let owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const app = await AppResource.fetchById(auth, aId);
  if (!app || app.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  if (!app.canWrite(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Creating a run requires write access to the app's space.",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  switch (req.method) {
    case "POST":
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

      const flags = await getFeatureFlags(owner);
      const storeBlocksResults = !flags.includes("disable_run_logs");

      // Fetch the feature flags of the app's workspace.
      const keyWorkspaceFlags = await getFeatureFlags(owner);

      const dustRun = await coreAPI.createRun(
        owner,
        keyWorkspaceFlags,
        auth.groups(),
        {
          projectId: app.dustAPIProjectId,
          runType: "local",
          specification: dumpSpecification(
            JSON.parse(req.body.specification),
            latestDatasets
          ),
          datasetId: inputDataset,
          config: { blocks: config },
          credentials: credentialsFromProviders(providers),
          secrets,
          storeBlocksResults,
        }
      );

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
          useWorkspaceCredentials: true,
        }),
        app.updateState(auth, {
          savedSpecification: req.body.specification,
          savedConfig: req.body.config,
          savedRun: dustRun.value.run.run_id,
        }),
      ]);

      res.status(200).json({ run: dustRun.value.run });
      return;

    case "GET":
      if (req.query.wIdTarget) {
        // If we have a `wIdTarget` query parameter, we are fetching runs that were created with an
        // API key coming from another workspace. So we override the `owner` variable. This is only
        // available to dust super users.

        // Dust super users can view runs of any workspace.
        const target = await Authenticator.fromSuperUserSession(
          session,
          req.query.wIdTarget as string
        );
        if (!target.isAdmin() || !auth.isDustSuperUser()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "workspace_auth_error",
              message: "wIdTarget is only available to Dust super users.",
            },
          });
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

        logger.info(
          {
            owner: owner.sId,
            targetOwner: targetOwner.sId,
            user: user.sId,
            app: app.sId,
          },
          "wIdTarget access"
        );

        owner = targetOwner;
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanWrite: true } })
);
