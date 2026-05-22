import { Authenticator } from "@app/lib/auth";
import type { PokeWorkspaceAuthEnv } from "@front-api/middleware/env";
import { resolveSession } from "@front-api/middleware/session_resolution";
import { apiError } from "@front-api/middleware/utils";
import { createMiddleware } from "hono/factory";

/**
 * Authenticates a workspace-scoped Poke (super-user) request and stores the
 * resolved `Authenticator` on the Hono context under the `auth` variable.
 *
 * Combines the super-user gate of `pokeAuth` with workspace resolution from
 * `workspaceAuth`. Apply to any route under `/api/poke/workspaces/:wId/...`.
 */
export const pokeWorkspaceAuth = createMiddleware<PokeWorkspaceAuthEnv>(
  async (ctx, next) => {
    const wId = ctx.req.param("wId");
    if (!wId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    }

    const sessionResult = await resolveSession(ctx);
    if (sessionResult instanceof Response) {
      return sessionResult;
    }

    const auth = await Authenticator.fromSuperUserSession(sessionResult, wId);

    if (!auth.isDustSuperUser()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "The user does not have permission",
        },
      });
    }

    if (!auth.workspace()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    }

    ctx.set("auth", auth);
    await next();
  }
);
