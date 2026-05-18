import { Hono } from "hono";

import { AppResource } from "@app/lib/resources/app_resource";
import type { AppType } from "@app/types/app";

import { spaceResource } from "@front-api/middleware/space_resource";

import blocks from "./blocks";
import cancel from "./cancel";
import status from "./status";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId.
const app = new Hono();

// GET / — get a run.
app.get("/", spaceResource({ requireCanRead: true }), async (c) => {
  // Keep the dynamic import: `@app/lib/api/run` is loaded lazily to avoid
  // pulling its dependency tree at module init time.
  const { getRun } = await import("@app/lib/api/run");
  const auth = c.get("auth");
  const space = c.get("space");
  const aId = c.req.param("aId") ?? "";
  const runId = c.req.param("runId") ?? "";

  const found = await AppResource.fetchById(auth, aId);
  if (!found || !found.canRead(auth) || found.space.sId !== space.sId) {
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
  const result = await getRun(auth, found.toJSON() as AppType, runId);
  if (!result) {
    return c.json(
      {
        error: { type: "run_not_found", message: "The run was not found" },
      },
      404
    );
  }
  return c.json({ run: result.run, spec: result.spec });
});

app.route("/cancel", cancel);
app.route("/status", status);
app.route("/blocks", blocks);

export default app;
