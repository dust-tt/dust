import type { GetWorkspaceVerifiedDomainsResponseType } from "@dust-tt/client";
import { Hono } from "hono";

import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

export const publicVerifiedDomainsApp = new Hono();

publicVerifiedDomainsApp.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isSystemKey()) {
    return c.json(
      {
        error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      },
      404
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);

  if (!workspaceResource) {
    // This should not happen as the workspace is fetched from the auth.
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
  const body: GetWorkspaceVerifiedDomainsResponseType = {
    verified_domains: verifiedDomains,
  };
  return c.json(body);
});
