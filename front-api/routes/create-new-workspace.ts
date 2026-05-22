import { createAndTrackMembership } from "@app/lib/api/membership";
import { getUserFromSession } from "@app/lib/iam/session";
import { createWorkspace } from "@app/lib/iam/workspaces";
import { UserResource } from "@app/lib/resources/user_resource";
import { sessionApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

import { sessionAuth } from "../middlewares/session_auth";

export const createNewWorkspaceApp = sessionApp();

createNewWorkspaceApp.use("*", sessionAuth);

createNewWorkspaceApp.post("/", async (ctx) => {
  const session = ctx.get("session");

  const user = await getUserFromSession(session);
  if (!user) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "The user is not found.",
      },
    });
  }

  if (user.workspaces.length > 0) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The user already has a workspace.",
      },
    });
  }

  const workspace = await createWorkspace(session);
  const u = await UserResource.fetchByModelId(user.id);
  if (!u) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "user_not_found", message: "The user was not found." },
    });
  }

  await createAndTrackMembership({
    user: u,
    workspace,
    role: "admin",
    origin: "invited",
  });

  return ctx.json({ sId: workspace.sId });
});
