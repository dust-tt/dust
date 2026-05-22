import { Authenticator } from "@app/lib/auth";
import type { PokeCtx } from "@front-api/middlewares/ctx";
import { resolveSession } from "@front-api/middlewares/session_resolution";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Authenticates a Poke (super-user) request and stashes the resolved session
 * and an unscoped `Authenticator` on the Hono context. Apply once at the
 * `/api/poke` root; workspace-scoped routes layer `withPokeWorkspace` on top.
 *
 * Mirrors `withSessionAuthenticationForPoke` in
 * `front/lib/api/auth_wrappers.ts`.
 */
export const pokeAuth = createMiddleware<PokeCtx>(async (ctx, next) => {
  const sessionResult = await resolveSession(ctx);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const auth = await Authenticator.fromSuperUserSession(sessionResult, null);

  if (!auth.isDustSuperUser()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  }

  ctx.set("auth", auth);
  ctx.set("session", sessionResult);
  await next();
});

/**
 * Re-scopes the existing Poke `Authenticator` to the `:wId` workspace from
 * the route and 404s if the workspace cannot be resolved. Apply after
 * `pokeAuth` so `session` is already on the context.
 */
export const withPokeWorkspace = createMiddleware<PokeCtx>(
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

    const session = ctx.get("session");
    const auth = await Authenticator.fromSuperUserSession(session, wId);

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
