import {
  getWorkspaceAnalytics,
  type WorkspaceAnalytics,
} from "@app/lib/api/workspace_analytics";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/workspace-analytics.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<WorkspaceAnalytics> => {
    const auth = ctx.get("auth");

    const analytics = await getWorkspaceAnalytics(auth);
    return ctx.json(analytics);
  }
);

export default app;
