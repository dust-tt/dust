import type { GetPermissionsResponseBody } from "@app/types/api/governance";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/permissions.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetPermissionsResponseBody> => {
  const auth = ctx.get("auth");

  const workspacePermissions = await auth.getWorkspacePermissions();

  return ctx.json({ workspacePermissions });
});

export default app;
