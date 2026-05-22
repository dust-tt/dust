import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { WorkspaceDomain } from "@app/types/workspace";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetWorkspaceVerifiedDomainsResponseBody = {
  verifiedDomains: WorkspaceDomain[];
};

// Mounted at /api/w/:wId/verified-domains.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetWorkspaceVerifiedDomainsResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access this endpoint.",
        },
      });
    }

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
