import { Hono } from "hono";

import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import { fetchUserFromSession } from "@app/lib/iam/users";

import { sessionAuth } from "../middleware/session_auth";

export const authContextApp = new Hono();

authContextApp.use("*", sessionAuth);

authContextApp.get("/", async (c) => {
  const session = c.get("session");

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

  const user = await fetchUserFromSession(session);
  if (!user) {
    return c.json(
      {
        error: {
          type: "user_not_found",
          message: "User not found.",
        },
      },
      403
    );
  }

  return c.json({
    user: user.toJSON(),
    defaultWorkspaceId: session.workspaceId ?? null,
  });
});
