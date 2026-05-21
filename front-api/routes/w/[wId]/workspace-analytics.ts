import {
  getWorkspaceAnalytics,
  type WorkspaceAnalytics,
} from "@app/lib/api/workspace_analytics";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/workspace-analytics.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<WorkspaceAnalytics> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can retrieve its monthly usage.",
      },
    });
  }

  const analytics = await getWorkspaceAnalytics(auth);
  return ctx.json(analytics);
});

export default app;
