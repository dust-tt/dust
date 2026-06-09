import type { GetRunResponseBody } from "@app/lib/api/apps";
import { AppResource } from "@app/lib/resources/app_resource";
import type { AppType } from "@app/types/app";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
  runId: z.string(),
});

import blocks from "./blocks";
import cancel from "./cancel";
import status from "./status";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId.
const app = workspaceApp();

// GET / — get a run.
/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetRunResponseBody> => {
    // Keep the dynamic import: `@app/lib/api/run` is loaded lazily to avoid
    // pulling its dependency tree at module init time.
    const { getRun } = await import("@app/lib/api/run");
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { aId, runId } = ctx.req.valid("param");

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
  }
);

app.route("/cancel", cancel);
app.route("/status", status);
app.route("/blocks", blocks);

export default app;
