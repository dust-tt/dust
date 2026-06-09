import type { GetWorkspaceVerifiedDomainsResponseBody } from "@app/lib/api/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/verified-domains.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWorkspaceVerifiedDomainsResponseBody> => {
    const auth = ctx.get("auth");

    const workspace = auth.getNonNullableWorkspace();
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);

    if (!workspaceResource) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to fetch the workspace.",
        },
      });
    }

    const verifiedDomains = await workspaceResource.getVerifiedDomains();
    return ctx.json({ verifiedDomains });
  }
);

export default app;
