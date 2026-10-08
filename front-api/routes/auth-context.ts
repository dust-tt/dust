import { getWorkspaceCellRedirect } from "@app/lib/api/cells/lookup";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { fetchUserFromSession } from "@app/lib/iam/users";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { SupportedLocale } from "@app/types/locale";
import { sessionApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { sessionAuth } from "../middlewares/session_auth";

export const authContextApp = sessionApp();

authContextApp.use("*", sessionAuth);

/**
 * @cc [owner:sfriquet,label:product;backend] locale-behind-default-workspace-flag
 * MUST return `undefined` when the session has no `workspaceId`, its workspace is not found, or
 * the `localisation` feature flag is disabled for that workspace. Otherwise it MUST return
 * `user.getLocale(workspace.locale)`, the locale that workspace's auth context returns.
 */
async function getDefaultWorkspaceUserLocale(
  session: SessionWithUser,
  user: UserResource
): Promise<SupportedLocale | undefined> {
  if (!session.workspaceId) {
    return undefined;
  }

  const auth = await Authenticator.fromSession(session, session.workspaceId);
  const workspace = auth.workspace();
  if (!workspace) {
    return undefined;
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("localisation")) {
    return undefined;
  }

  return user.getLocale(workspace.locale);
}

authContextApp.get("/", async (ctx) => {
  const session = ctx.get("session");

  if (session.workspaceId) {
    const redirect = await getWorkspaceCellRedirect(session.workspaceId);
    if (redirect) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "workspace_in_different_cell",
          message: "Workspace is located in a different cell",
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

  const locale = await getDefaultWorkspaceUserLocale(session, user);

  return ctx.json({
    user: user.toJSON(),
    defaultWorkspaceId: session.workspaceId ?? null,
    ...(locale && { locale }),
  });
});
