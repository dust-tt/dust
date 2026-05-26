import { exportApps } from "@app/lib/utils/apps";
import type { GetAppsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
// Mounted at /api/v1/w/:wId/spaces/:spaceId/apps/export.
const app = publicApiApp();

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetAppsResponseType> => {
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

    const apps = await exportApps(auth, space);
    if (apps.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to export apps.",
        },
      });
    }

    return ctx.json({ apps: apps.value });
  }
);

export default app;
