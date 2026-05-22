import config from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";
import { credentialsFromProviders } from "@app/types/api/credentials";
import { CoreAPI } from "@app/types/core/core_api";
import type { APIErrorResponse } from "@app/types/error";
import type { RunType } from "@app/types/run";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { sessionAuth } from "@front-api/middlewares/session_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";
import type { Context, TypedResponse } from "hono";

import runId from "./[runId]";

export type GetRunsResponseBody = {
  runs: RunType[];
  total: number;
};

export type PostRunsResponseBody = {
  run: RunType;
};

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs.
const app = workspaceApp();

// Shared prelude for GET and POST: resolves the app from `:aId`, verifies it
// belongs to the current space, and enforces write access on it. Returns
// either the loaded resources or the `Response` to short-circuit with.
async function loadApp(
  ctx: Context
): Promise<
  { appResource: AppResource } | (Response & TypedResponse<APIErrorResponse>)
> {
  const auth = ctx.get("auth");
  const space = ctx.get("space");
  const { aId } = ctx.req.param();
  if (!isString(aId)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const appResource = await AppResource.fetchById(auth, aId);
  if (!appResource || appResource.space.sId !== space.sId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "app_not_found", message: "The app was not found." },
    });
  }

  if (!appResource.canWrite(auth)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Creating a run requires write access to the app's space.",
      },
    });
  }

  return { appResource };
}

app.get(
  "/",
  sessionAuth,
  withSpace({ requireCanWrite: true }),
  async (ctx): HandlerResult<GetRunsResponseBody> => {
    const loaded = await loadApp(ctx);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { appResource } = loaded;
    const auth = ctx.get("auth");
    const session = ctx.get("session");
    const user = auth.getNonNullableUser();

    let owner = auth.getNonNullableWorkspace();
    const wIdTarget = ctx.req.query("wIdTarget");
    if (wIdTarget && session) {
      // Override `owner` when fetching runs created with an API key from
      // another workspace. Dust super users only.
      const target = await Authenticator.fromSuperUserSession(
        session,
        wIdTarget
      );
      if (!target.isAdmin() || !auth.isDustSuperUser()) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "workspace_auth_error",
            message: "wIdTarget is only available to Dust super users.",
          },
        });
      }

      const targetOwner = target.workspace();
      if (!targetOwner) {
        return apiError(ctx, {
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
          app: appResource.sId,
        },
        "wIdTarget access"
      );

      owner = targetOwner;
    }

    const limitStr = ctx.req.query("limit");
    const limit = limitStr ? parseInt(limitStr) : 10;
    const offsetStr = ctx.req.query("offset");
    const offset = offsetStr ? parseInt(offsetStr) : 0;
    const runType = ctx.req.query("runType") ?? "local";

    const userRuns = await RunResource.listByAppAndRunType(
      owner,
      { appId: appResource.id, runType },
      { limit, offset }
    );

    const totalNumberOfRuns = await RunResource.countByAppAndRunType(owner, {
      appId: appResource.id,
      runType,
    });
    const userDustRunIds = userRuns.map((r) => r.dustRunId);

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const dustRuns = await coreAPI.getRunsBatch({
      projectId: appResource.dustAPIProjectId,
      dustRunIds: userDustRunIds,
    });

    if (dustRuns.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Runs retrieval failed.",
        },
      });
    }

    return ctx.json({
      runs: userDustRunIds.map((dustRunId) => dustRuns.value.runs[dustRunId]),
      total: totalNumberOfRuns,
    });
  }
);

app.post(
  "/",
  withSpace({ requireCanWrite: true }),
  async (ctx): HandlerResult<PostRunsResponseBody> => {
    const loaded = await loadApp(ctx);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { appResource } = loaded;
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const [providers, secrets] = await Promise.all([
      ProviderModel.findAll({
        where: {
          workspaceId: owner.id,
        },
      }),
      getDustAppSecrets(auth, true),
    ]);

    const body = await ctx.req.json().catch(() => null);
    if (
      !body ||
      !(typeof body.config == "string") ||
      !(typeof body.specification === "string")
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The request body is invalid, expects { config: string, specificationHash: string }.",
        },
      });
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const datasets = await coreAPI.getDatasets({
      projectId: appResource.dustAPIProjectId,
    });
    if (datasets.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Datasets retrieval failed.",
        },
      });
    }

    const latestDatasets: { [key: string]: string } = {};
    for (const d in datasets.value.datasets) {
      latestDatasets[d] = datasets.value.datasets[d][0].hash;
    }

    const blockConfig = JSON.parse(body.config);
    const inputConfigEntry: any = Object.values(blockConfig).find(
      (configValue: any) => configValue.type == "input"
    );
    const inputDataset = inputConfigEntry ? inputConfigEntry.dataset : null;

    const flags = await getFeatureFlags(auth);
    const storeBlocksResults = !flags.includes("disable_run_logs");

    const dustRun = await coreAPI.createRun(owner, flags, {
      projectId: appResource.dustAPIProjectId,
      runType: "local",
      specification: dumpSpecification(
        JSON.parse(body.specification),
        latestDatasets
      ),
      datasetId: inputDataset,
      config: { blocks: blockConfig },
      credentials: credentialsFromProviders(providers),
      secrets,
      storeBlocksResults,
    });

    if (dustRun.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "run_error",
          message: "Run creation failed.",
        },
      });
    }

    await Promise.all([
      RunResource.makeNew({
        dustRunId: dustRun.value.run.run_id,
        appId: appResource.id,
        runType: "local",
        workspaceId: owner.id,
        useWorkspaceCredentials: true,
      }),
      appResource.updateState(auth, {
        savedSpecification: body.specification,
        savedConfig: body.config,
        savedRun: dustRun.value.run.run_id,
      }),
    ]);

    return ctx.json({ run: dustRun.value.run });
  }
);

app.route("/:runId", runId);

export default app;
