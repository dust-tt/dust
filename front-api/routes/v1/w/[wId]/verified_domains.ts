import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { GetWorkspaceVerifiedDomainsResponseType } from "@dust-tt/client";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Re-exported so SWR hooks and other consumers can import the response type
// from the Hono route file, matching the convention of our other routes.
export type { GetWorkspaceVerifiedDomainsResponseType } from "@dust-tt/client";

// Mounted at /api/v1/w/:wId/verified_domains.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isSystemKey()) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);

  if (!workspaceResource) {
    // This should not happen as the workspace is fetched from the auth.
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch the workspace.",
      },
    });
  }

  const verifiedDomains = await workspaceResource.getVerifiedDomains();
  const body: GetWorkspaceVerifiedDomainsResponseType = {
    verified_domains: verifiedDomains,
  };
  return c.json(body);
});

export default app;
