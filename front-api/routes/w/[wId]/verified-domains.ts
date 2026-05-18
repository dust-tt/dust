import { Hono } from "hono";

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
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access this endpoint.",
        },
      },
      403
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);

  if (!workspaceResource) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to fetch the workspace.",
        },
      },
      500
    );
  }

  const verifiedDomains = await workspaceResource.getVerifiedDomains();
  const body: GetWorkspaceVerifiedDomainsResponseBody = { verifiedDomains };
  return c.json(body);
});

export default app;
