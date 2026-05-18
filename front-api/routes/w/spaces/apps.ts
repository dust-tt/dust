import { Hono } from "hono";
import { z } from "zod";

import { softDeleteApp } from "@app/lib/api/apps";
import config from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import type { AppType } from "@app/types/app";
import { APP_NAME_REGEXP } from "@app/types/app";
import type { BlockType } from "@app/types/run";
import { CoreAPI } from "@app/types/core/core_api";

import { spaceResource } from "../../../middleware/space_resource";
import { validate } from "../../../middleware/validator";

const PostAppBodySchema = z.object({
  name: z.string(),
  description: z.string(),
});
const PatchAppBodySchema = z.object({
  name: z.string(),
  description: z.string(),
});
const PostStateBodySchema = z.object({
  specification: z.string(),
  config: z.string(),
  run: z.string().optional(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/apps.
export const appsApp = new Hono();

// GET / — list apps in space.
appsApp.get(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const apps = await AppResource.listBySpace(auth, space);
    return c.json({ apps: apps.map((a) => a.toJSON()) });
  }
);

// POST / — create app.
appsApp.post(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("json", PostAppBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const owner = auth.getNonNullableWorkspace();

    if (!space.canWrite(auth) || !auth.isBuilder()) {
      return c.json(
        {
          error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can create an app.",
          },
        },
        403
      );
    }

    const { name, description } = c.req.valid("json");
    if (!APP_NAME_REGEXP.test(name)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "The app name is invalid, expects a string with a length of 1-64 characters, containing only alphanumeric characters, underscores, and dashes.",
          },
        },
        400
      );
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const p = await coreAPI.createProject();
    if (p.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "Failed to create internal project for the app.",
            data_source_error: p.error,
          },
        },
        500
      );
    }

    const app = await AppResource.makeNew(
      {
        sId: generateRandomModelSId(),
        name,
        description: description || null,
        dustAPIProjectId: p.value.project.project_id.toString(),
        workspaceId: owner.id,
        visibility: "private",
      },
      space
    );
    return c.json({ app: app.toJSON() }, 201);
  }
);

// GET /:aId — read app.
appsApp.get("/:aId", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");
  const aId = c.req.param("aId") ?? "";

  const app = await AppResource.fetchById(auth, aId);
  if (!app || app.space.sId !== space.sId || !app.canRead(auth)) {
    return c.json(
      {
        error: { type: "app_not_found", message: "The app was not found." },
      },
      404
    );
  }
  return c.json({ app: app.toJSON() });
});

// POST /:aId — update app settings.
appsApp.post(
  "/:aId",
  spaceResource({ requireCanRead: true }),
  validate("json", PatchAppBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";

    const app = await AppResource.fetchById(auth, aId);
    if (!app || app.space.sId !== space.sId || !app.canRead(auth)) {
      return c.json(
        {
          error: { type: "app_not_found", message: "The app was not found." },
        },
        404
      );
    }
    if (!app.canWrite(auth)) {
      return c.json(
        {
          error: {
            type: "app_auth_error",
            message:
              "Modifying an app requires write access to the app's space.",
          },
        },
        403
      );
    }
    const { name, description } = c.req.valid("json");
    if (!APP_NAME_REGEXP.test(name)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "The app name is invalid, expects a string with a length of 1-64 characters, containing only alphanumeric characters, underscores, and dashes.",
          },
        },
        400
      );
    }
    await app.updateSettings(auth, { name, description });
    return c.json({ app: app.toJSON() });
  }
);

// DELETE /:aId — soft delete app.
appsApp.delete("/:aId", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");
  const aId = c.req.param("aId") ?? "";

  const app = await AppResource.fetchById(auth, aId);
  if (!app || app.space.sId !== space.sId || !app.canRead(auth)) {
    return c.json(
      {
        error: { type: "app_not_found", message: "The app was not found." },
      },
      404
    );
  }
  if (!app.canWrite(auth)) {
    return c.json(
      {
        error: {
          type: "app_auth_error",
          message: "Deleting an app requires write access to the app's space.",
        },
      },
      403
    );
  }
  const deleteRes = await softDeleteApp(auth, app);
  if (deleteRes.isErr()) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: deleteRes.error.message,
        },
      },
      409
    );
  }
  return c.body(null, 204);
});

// POST /:aId/state — update app run state.
appsApp.post(
  "/:aId/state",
  spaceResource({ requireCanWrite: true }),
  validate("json", PostStateBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";

    const app = await AppResource.fetchById(auth, aId);
    if (!app || app.space.sId !== space.sId) {
      return c.json(
        {
          error: { type: "app_not_found", message: "The app was not found." },
        },
        404
      );
    }
    if (!app.canWrite(auth)) {
      return c.json(
        {
          error: {
            type: "app_auth_error",
            message:
              "Modifying an app requires write access to the app's space.",
          },
        },
        403
      );
    }
    const { specification, config: appConfig, run } = c.req.valid("json");
    const updateParams: {
      savedSpecification: string;
      savedConfig: string;
      savedRun?: string;
    } = {
      savedSpecification: specification,
      savedConfig: appConfig,
    };
    if (run) {
      updateParams.savedRun = run;
    }
    await app.updateState(auth, updateParams);
    return c.json({ app: app.toJSON() });
  }
);

// GET /:aId/runs/:runId — get a run.
appsApp.get(
  "/:aId/runs/:runId",
  spaceResource({ requireCanRead: true }),
  async (c) => {
    const { getRun } = await import("@app/lib/api/run");
    const auth = c.get("auth");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";
    const runId = c.req.param("runId") ?? "";

    const app = await AppResource.fetchById(auth, aId);
    if (!app || !app.canRead(auth) || app.space.sId !== space.sId) {
      return c.json(
        {
          error: {
            type: "app_not_found",
            message: "The app you're trying to access was not found",
          },
        },
        404
      );
    }
    const result = await getRun(auth, app.toJSON() as AppType, runId);
    if (!result) {
      return c.json(
        {
          error: { type: "run_not_found", message: "The run was not found" },
        },
        404
      );
    }
    return c.json({ run: result.run, spec: result.spec });
  }
);

// POST /:aId/runs/:runId/cancel — cancel a run.
appsApp.post(
  "/:aId/runs/:runId/cancel",
  spaceResource({ requireCanWrite: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";
    const runId = c.req.param("runId") ?? "";

    const app = await AppResource.fetchById(auth, aId);
    if (!app || app.space.sId !== space.sId) {
      return c.json(
        {
          error: { type: "app_not_found", message: "The app was not found." },
        },
        404
      );
    }
    if (!app.canWrite(auth)) {
      return c.json(
        {
          error: {
            type: "app_auth_error",
            message:
              "Canceling a run requires write access to the app's space.",
          },
        },
        403
      );
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const runStatus = await coreAPI.getRunStatus({
      projectId: app.dustAPIProjectId,
      runId,
    });
    if (runStatus.isErr()) {
      if (runStatus.error.code === "run_not_found") {
        return c.json({ success: true });
      }
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "Failed to fetch run status.",
            app_error: runStatus.error,
          },
        },
        500
      );
    }
    if (runStatus.value.run.status.run !== "running") {
      return c.json({ success: true });
    }

    const cancelResult = await coreAPI.cancelRun({
      projectId: app.dustAPIProjectId,
      runId,
    });
    if (cancelResult.isErr()) {
      logger.error(
        {
          error: cancelResult.error,
          runId,
          projectId: app.dustAPIProjectId,
        },
        "Failed to cancel run"
      );
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "Failed to cancel the run.",
            app_error: cancelResult.error,
          },
        },
        500
      );
    }

    logger.info(
      { runId, projectId: app.dustAPIProjectId },
      "Run cancelled successfully"
    );
    return c.json({ success: true });
  }
);

// GET /:aId/runs/:runId/status — get run status.
appsApp.get(
  "/:aId/runs/:runId/status",
  spaceResource({ requireCanRead: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";
    let runId: string | null = c.req.param("runId") ?? null;

    const app = await AppResource.fetchById(auth, aId);
    if (!app || app.space.sId !== space.sId) {
      return c.json(
        {
          error: { type: "app_not_found", message: "The app was not found." },
        },
        404
      );
    }
    if (!app.canRead(auth)) {
      return c.json(
        {
          error: {
            type: "app_auth_error",
            message: "Reading the app requires read access to the app's space.",
          },
        },
        403
      );
    }
    if (runId === "saved") runId = app.savedRun;
    if (!runId || runId.length === 0) {
      return c.json({ run: null });
    }
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const run = await coreAPI.getRunStatus({
      projectId: app.dustAPIProjectId,
      runId,
    });
    if (run.isErr()) {
      if (run.error.code === "run_not_found") {
        return c.json(
          {
            error: { type: "run_not_found", message: "The run was not found." },
          },
          404
        );
      }
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "The run status retrieval failed.",
            app_error: run.error,
          },
        },
        500
      );
    }
    return c.json({ run: run.value.run });
  }
);

// GET /:aId/runs/:runId/blocks/:type/:name — get a run block.
appsApp.get(
  "/:aId/runs/:runId/blocks/:type/:name",
  spaceResource({ requireCanWrite: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";
    let runId: string | null = c.req.param("runId") ?? null;

    const app = await AppResource.fetchById(auth, aId);
    if (!app || app.space.sId !== space.sId) {
      return c.json(
        {
          error: { type: "app_not_found", message: "The app was not found." },
        },
        404
      );
    }
    if (!app.canWrite(auth)) {
      return c.json(
        {
          error: {
            type: "app_auth_error",
            message:
              "Retrieving content of runs requires write access to the app's space.",
          },
        },
        403
      );
    }
    if (runId === "saved") runId = app.savedRun;
    if (!runId || runId.length === 0) {
      return c.json({ run: null });
    }
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const run = await coreAPI.getRunBlock({
      projectId: app.dustAPIProjectId,
      runId,
      blockType: c.req.param("type") as BlockType,
      blockName: c.req.param("name") ?? "",
    });
    if (run.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "The run block retrieval failed.",
            app_error: run.error,
          },
        },
        500
      );
    }
    return c.json({ run: run.value.run });
  }
);
