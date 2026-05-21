import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import { Authenticator } from "@app/lib/auth";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetPokeWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: true;
  isBuilder: true;
  isSuperUser: true;
};

// Mounted at /api/poke/workspaces/:wId/auth-context.
//
// This route deliberately does NOT use pokeWorkspaceAuth: when the workspace
// is not found locally we still need to check whether it lives in another
// region and respond with a redirect rather than a plain 404. pokeAuth is
// inherited from the parent /poke sub-app and stashes the session, which we
// use here to resolve a workspace-scoped Authenticator inline.
const app = new Hono();

app.get(
  "/",
  async (ctx): HandlerResult<GetPokeWorkspaceAuthContextResponseType> => {
    const wId = ctx.req.param("wId") ?? "";
    const session = ctx.get("session");

    const auth = await Authenticator.fromSuperUserSession(session, wId);
    const workspace = auth.workspace();
    const subscription = auth.subscription();

    // If workspace not found locally, look it up in other regions.
    if (!workspace || !subscription) {
      const redirect = await getWorkspaceRegionRedirect(wId);

      // Cross-region is a routing signal, not an error worth logging — match
      // the /api/w/:wId/auth-context precedent and the original Next handler
      // by returning the response shape directly instead of via `apiError`.
      if (redirect) {
        return ctx.json(
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

      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "Workspace not found.",
        },
      });
    }

    const user = auth.getNonNullableUser();

    return ctx.json({
      user: user.toJSON(),
      workspace,
      subscription,
      isAdmin: true,
      isBuilder: true,
      isSuperUser: true,
    });
  }
);

export default app;
