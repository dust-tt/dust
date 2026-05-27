import { importApps } from "@app/lib/utils/apps";
import type { ImportAppsResponseType } from "@dust-tt/client";
import { PostAppsRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
// Mounted at /api/v1/w/:wId/spaces/:spaceId/apps/import.
const app = publicApiApp();

app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PostAppsRequestSchema),
  async (ctx): HandlerResult<ImportAppsResponseType> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_oauth_token_error",
          message: "Only system keys are allowed to use this endpoint.",
        },
      });
    }

    const body = ctx.req.valid("json");
    const result = await importApps(auth, space, body.apps);

    return ctx.json({ apps: result });
  }
);

export default app;
