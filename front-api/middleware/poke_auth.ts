import { Authenticator } from "@app/lib/auth";
import { resolveSession } from "@front-api/middleware/session_resolution";
import { apiError } from "@front-api/middleware/utils";
import type { MiddlewareHandler } from "hono";

/**
 * Authenticates a Poke (super-user) request and stores the resolved
 * `Authenticator` on the Hono context under the `auth` variable.
 *
 * Mirrors the behavior of `withSessionAuthenticationForPoke` in
 * `front/lib/api/auth_wrappers.ts`. Apply to any route under
 * `/api/poke/...`.
 */
export const pokeAuth: MiddlewareHandler = async (ctx, next) => {
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
};
