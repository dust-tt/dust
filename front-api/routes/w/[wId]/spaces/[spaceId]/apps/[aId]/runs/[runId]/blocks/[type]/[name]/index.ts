import { Hono } from "hono";

import config from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import logger from "@app/logger/logger";
import type { BlockType } from "@app/types/run";
import { CoreAPI } from "@app/types/core/core_api";

import { spaceResource } from "@front-api/middleware/space_resource";

// Mounted under
// /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/blocks/:type/:name.
const app = new Hono();

app.get("/", spaceResource({ requireCanWrite: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");
  const aId = c.req.param("aId") ?? "";
  let runId: string | null = c.req.param("runId") ?? null;

  const found = await AppResource.fetchById(auth, aId);
  if (!found || found.space.sId !== space.sId) {
    return c.json(
      {
        error: { type: "app_not_found", message: "The app was not found." },
      },
      404
    );
  }
  if (!found.canWrite(auth)) {
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
  if (runId === "saved") runId = found.savedRun;
  if (!runId || runId.length === 0) {
    return c.json({ run: null });
  }
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const run = await coreAPI.getRunBlock({
    projectId: found.dustAPIProjectId,
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
});

export default app;
