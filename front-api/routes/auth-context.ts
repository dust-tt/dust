import { Hono } from "hono";

import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";

export const authContextApp = new Hono();

authContextApp.get("/", async (c) => {
  const session = c.get("session");
  const user = c.get("userResource");

  if (session.workspaceId) {
    const redirect = await getWorkspaceRegionRedirect(session.workspaceId);
    if (redirect) {
      return c.json(
        {
          error: {
            type: "workspace_in_different_region",
            message: "Workspace is located in a different region",
            redirect,
          },
        },
        400
      );
    }
  }

  return c.json({
    user: user.toJSON(),
    defaultWorkspaceId: session.workspaceId ?? null,
  });
});
