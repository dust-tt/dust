import { Hono } from "hono";

import { createAndTrackMembership } from "@app/lib/api/membership";
import { getUserWithWorkspaces } from "@app/lib/api/user";
import { createWorkspace } from "@app/lib/iam/workspaces";

export const createNewWorkspaceApp = new Hono();

createNewWorkspaceApp.post("/", async (c) => {
  const session = c.get("session");
  const userResource = c.get("userResource");

  const user = await getUserWithWorkspaces(userResource);

  if (user.workspaces.length > 0) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "The user already has a workspace.",
        },
      },
      400
    );
  }

  const workspace = await createWorkspace(session);

  await createAndTrackMembership({
    user: userResource,
    workspace,
    role: "admin",
    origin: "invited",
  });

  return c.json({ sId: workspace.sId });
});
