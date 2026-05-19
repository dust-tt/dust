import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { WorkspaceDomain } from "@app/types/workspace";

export type GetWorkspaceVerifiedDomainsResponseBody = {
  verifiedDomains: WorkspaceDomain[];
};

// Mounted at /api/w/:wId/verified-domains.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
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
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch the workspace.",
      },
    });
  }

  const verifiedDomains = await workspaceResource.getVerifiedDomains();
  const body: GetWorkspaceVerifiedDomainsResponseBody = { verifiedDomains };
  return c.json(body);
});

export default app;
