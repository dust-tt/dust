import { AppResource } from "@app/lib/resources/app_resource";
import { type ExportedApp, exportAppWithDatasets } from "@app/lib/utils/apps";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type ExportAppResponseBody = {
  app: ExportedApp;
};

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/apps/:aId/export.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<ExportAppResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");
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

    return ctx.json({ app: exported });
  }
);

export default app;
