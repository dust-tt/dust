import { listPodApps } from "@app/lib/api/projects/apps";
import type { GetPodAppsResponseBody } from "@app/types/api/pod_apps";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/pods/:podId/apps.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanRead: true, routeParam: "podId" }),
  async (ctx): HandlerResult<GetPodAppsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const appsResult = await listPodApps(auth, space);
    if (appsResult.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: appsResult.error.message,
        },
      });
    }

    return ctx.json({ apps: appsResult.value });
  }
);

export default app;
