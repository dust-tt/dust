import type { MiddlewareHandler } from "hono";

import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";

import { resolveSession } from "@front-api/middleware/session_resolution";
import { apiError } from "@front-api/middleware/utils";

declare module "hono" {
  interface ContextVariableMap {
    pokeSession: SessionWithUser;
  }
}

/**
 * Authenticates a Poke (super-user) request and stores the resolved
 * `Authenticator` (built with `null` workspace) on the Hono context under
 * `auth`. The raw session is also stashed under `pokeSession` so
 * workspace-scoped poke routes can re-build a workspace-scoped Authenticator.
 *
 * Mirrors the behavior of `withSessionAuthenticationForPoke` in
 * `front/lib/api/auth_wrappers.ts`. Apply to any route under
 * `/api/poke/...`.
 */
export const pokeAuth: MiddlewareHandler = async (c, next) => {
  const sessionResult = await resolveSession(c);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const auth = await Authenticator.fromSuperUserSession(sessionResult, null);

  if (!auth.isDustSuperUser()) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  }

  c.set("auth", auth);
  c.set("pokeSession", sessionResult);
  await next();
};
