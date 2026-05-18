import { Hono } from "hono";

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

import { sessionAuth } from "@front-api/middleware/session_auth";
import { spaceResource } from "@front-api/middleware/space_resource";

import runId from "./[runId]";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs.
const app = new Hono();

app.get(
  "/",
  sessionAuth,
  spaceResource({ requireCanWrite: true }),
  async (c) => {
    const auth = c.get("auth");
    const session = c.get("session");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";

    let owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const appResource = await AppResource.fetchById(auth, aId);
    if (!appResource || appResource.space.sId !== space.sId) {
      return c.json(
        {
          error: { type: "app_not_found", message: "The app was not found." },
        },
        404
      );
    }

    if (!appResource.canWrite(auth)) {
      return c.json(
        {
          error: {
            type: "app_auth_error",
            message: "Creating a run requires write access to the app's space.",
          },
        },
        403
      );
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    const wIdTarget = c.req.query("wIdTarget");
    if (wIdTarget && session) {
      // If we have a `wIdTarget` query parameter, we are fetching runs that were created with an
      // API key coming from another workspace. So we override the `owner` variable. This is only
      // available to dust super users.

      // Dust super users can view runs of any workspace.
      const target = await Authenticator.fromSuperUserSession(
        session,
        wIdTarget
      );
      if (!target.isAdmin() || !auth.isDustSuperUser()) {
        return c.json(
          {
            error: {
              type: "workspace_auth_error",
              message: "wIdTarget is only available to Dust super users.",
            },
          },
          404
        );
      }

      const targetOwner = target.workspace();
      if (!targetOwner) {
        return c.json(
          {
            error: {
              type: "app_not_found",
              message: "The app was not found.",
            },
          },
          404
        );
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

    const limitStr = c.req.query("limit");
    const limit = limitStr ? parseInt(limitStr) : 10;
    const offsetStr = c.req.query("offset");
    const offset = offsetStr ? parseInt(offsetStr) : 0;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const runType = c.req.query("runType") ? c.req.query("runType") : "local";

    const userRuns = await RunResource.listByAppAndRunType(
      owner,
      { appId: appResource.id, runType: runType as string },
      { limit, offset }
    );

    const totalNumberOfRuns = await RunResource.countByAppAndRunType(owner, {
      appId: appResource.id,
      runType: runType as string,
    });
    const userDustRunIds = userRuns.map((r) => r.dustRunId);

    const dustRuns = await coreAPI.getRunsBatch({
      projectId: appResource.dustAPIProjectId,
      dustRunIds: userDustRunIds,
    });

    if (dustRuns.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "Runs retrieval failed.",
          },
        },
        500
      );
    }

    return c.json({
      runs: userDustRunIds.map((dustRunId) => dustRuns.value.runs[dustRunId]),
      total: totalNumberOfRuns,
    });
  }
);

app.post("/", spaceResource({ requireCanWrite: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");
  const aId = c.req.param("aId") ?? "";
  const owner = auth.getNonNullableWorkspace();

  const appResource = await AppResource.fetchById(auth, aId);
  if (!appResource || appResource.space.sId !== space.sId) {
    return c.json(
      {
        error: { type: "app_not_found", message: "The app was not found." },
      },
      404
    );
  }

  if (!appResource.canWrite(auth)) {
    return c.json(
      {
        error: {
          type: "app_auth_error",
          message: "Creating a run requires write access to the app's space.",
        },
      },
      403
    );
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const [providers, secrets] = await Promise.all([
    ProviderModel.findAll({
      where: {
        workspaceId: owner.id,
      },
    }),
    getDustAppSecrets(auth, true),
  ]);

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    !(typeof body.config == "string") ||
    !(typeof body.specification === "string")
  ) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message:
            "The request body is invalid, expects { config: string, specificationHash: string }.",
        },
      },
      400
    );
  }

  const datasets = await coreAPI.getDatasets({
    projectId: appResource.dustAPIProjectId,
  });
  if (datasets.isErr()) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Datasets retrieval failed.",
        },
      },
      500
    );
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

  // Fetch the feature flags of the app's workspace.
  const keyWorkspaceFlags = await getFeatureFlags(auth);

  const dustRun = await coreAPI.createRun(
    owner,
    keyWorkspaceFlags,
    auth.groupIds(),
    {
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
    }
  );

  if (dustRun.isErr()) {
    return c.json(
      {
        error: {
          type: "run_error",
          message: "Run creation failed.",
        },
      },
      400
    );
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

  return c.json({ run: dustRun.value.run });
});

app.route("/:runId", runId);

export default app;
