import { AppResource } from "@app/lib/resources/app_resource";
import { type ExportedApp, exportAppWithDatasets } from "@app/lib/utils/apps";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type ExportAppResponseBody = {
  app: ExportedApp;
};

// Mounted at /api/poke/workspaces/:wId/apps/:aId/export.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId");
  if (!aId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const appResource = await AppResource.fetchById(auth, aId);
  if (!appResource) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you requested was not found.",
      },
    });
  }

  const exported = await exportAppWithDatasets(auth, appResource);

  const body: ExportAppResponseBody = { app: exported };
  return ctx.json(body);
});

export default app;
