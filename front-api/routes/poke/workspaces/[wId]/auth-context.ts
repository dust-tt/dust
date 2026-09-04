import { getWorkspaceCellRedirect } from "@app/lib/api/cells/lookup";
import type { GetPokeWorkspaceAuthContextResponseType } from "@app/lib/api/poke/auth_context";
import { Authenticator } from "@app/lib/auth";
import { allWorkspacePermissions } from "@app/lib/resources/group_permission_registry";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  wId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/auth-context.
//
// This route deliberately does NOT use withPokeWorkspace: when the workspace
// is not found locally we still need to check whether it lives in another
// region and respond with a redirect rather than a plain 404. pokeAuth is
// inherited from the parent /poke sub-app and stashes the unscoped super-user
// Authenticator, which we re-scope to the target workspace inline.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetPokeWorkspaceAuthContextResponseType> => {
    const { wId } = ctx.req.valid("param");
    const current = ctx.get("auth");

    const auth = await Authenticator.fromDustSuperUser({
      user: current.user(),
      wId,
      pokePrincipal: current.getPokePrincipal(),
    });
    const workspace = auth.workspace();
    const subscription = auth.subscription();

    // If workspace not found locally, look it up in other regions.
    if (!workspace || !subscription) {
      const redirect = await getWorkspaceCellRedirect(wId);

      // Cross-region is a routing signal, not an error worth logging — match
      // the /api/w/:wId/auth-context precedent and the original Next handler
      // by returning the response shape directly instead of via `apiError`.
      if (redirect) {
        return ctx.json(
          {
            error: {
              type: "workspace_in_different_cell",
              message: "Workspace is located in a different cell",
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

    const workspacePermissions = allWorkspacePermissions();

    return ctx.json({
      user: auth.toPokeUserJSON(),
      workspace,
      subscription,
      isAdmin: true,
      isManager: true,
      isSuperUser: true,
      workspacePermissions,
    });
  }
);

export default app;
