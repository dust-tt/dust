import { createApp, listApps } from "@app/lib/api/top_level_apps";
import type {
  GetTopLevelAppsResponseBody,
  PostTopLevelAppResponseBody,
} from "@app/types/api/top_level_apps";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

// Mounted under /api/w/:wId/apps. workspaceAuth is applied by the parent workspace sub-app, so
// ctx.get("auth") is always available here.
const app = workspaceApp();

app.use(
  "*",
  withFeatureFlag("top_level_apps", {
    message: "Apps are not enabled for this workspace.",
  })
);

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetTopLevelAppsResponseBody> => {
  const auth = ctx.get("auth");

  return ctx.json({ apps: await listApps(auth) });
});

/** @ignoreswagger */
app.post("/", async (ctx): HandlerResult<PostTopLevelAppResponseBody> => {
  const auth = ctx.get("auth");

  const appRes = await createApp(auth);
  if (appRes.isErr()) {
    switch (appRes.error.code) {
      case "limit_reached":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "plan_limit_error",
            message:
              "Limit of spaces allowed for your plan reached. Contact support to upgrade.",
          },
        });
      case "unauthorized":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: appRes.error.message,
          },
        });
      case "internal_error":
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: appRes.error.message,
          },
        });
      default:
        assertNever(appRes.error.code);
    }
  }

  return ctx.json({ app: appRes.value }, 201);
});

export default app;
