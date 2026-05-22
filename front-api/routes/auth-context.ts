import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { sessionApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

import { sessionAuth } from "../middlewares/session_auth";

export const authContextApp = sessionApp();

authContextApp.use("*", sessionAuth);

authContextApp.get("/", async (ctx) => {
  const session = ctx.get("session");

  if (session.workspaceId) {
    const redirect = await getWorkspaceRegionRedirect(session.workspaceId);
    if (redirect) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "workspace_in_different_region",
          message: "Workspace is located in a different region",
          redirect,
        },
      });
    }
  }

  const user = await fetchUserFromSession(session);
  if (!user) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "user_not_found",
        message: "User not found.",
      },
    });
  }

  return ctx.json({
    user: user.toJSON(),
    defaultWorkspaceId: session.workspaceId ?? null,
  });
});
