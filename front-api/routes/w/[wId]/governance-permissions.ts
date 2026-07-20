import { getWorkspaceGovernancePermissions } from "@app/lib/api/permissions/governance";
import type { GetGovernancePermissionsResponseBody } from "@app/types/api/governance";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsBusinessAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/governance-permissions.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsBusinessAdmin(),
  async (ctx): HandlerResult<GetGovernancePermissionsResponseBody> => {
    const auth = ctx.get("auth");

    const governancePermissions = await getWorkspaceGovernancePermissions(auth);

    return ctx.json({ governancePermissions });
  }
);

export default app;
