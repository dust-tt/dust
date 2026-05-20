import { AppResource } from "@app/lib/resources/app_resource";
import type { AppType } from "@app/types/app";
import { withSpace } from "@front-api/middleware/with_space";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

import blocks from "./blocks";
import cancel from "./cancel";
import status from "./status";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId.
const app = new Hono();

// GET / — get a run.
app.get("/", withSpace({ requireCanRead: true }), async (ctx) => {
  // Keep the dynamic import: `@app/lib/api/run` is loaded lazily to avoid
  // pulling its dependency tree at module init time.
  const { getRun } = await import("@app/lib/api/run");
  const auth = ctx.get("auth");
  const space = ctx.get("space");
  const aId = ctx.req.param("aId") ?? "";
  const runId = ctx.req.param("runId") ?? "";

  const found = await AppResource.fetchById(auth, aId);
  if (!found || !found.canRead(auth) || found.space.sId !== space.sId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to access was not found",
      },
    });
  }
  const result = await getRun(auth, found.toJSON() as AppType, runId);
  if (!result) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "run_not_found", message: "The run was not found" },
    });
  }
  return ctx.json({ run: result.run, spec: result.spec });
});

app.route("/cancel", cancel);
app.route("/status", status);
app.route("/blocks", blocks);

export default app;
