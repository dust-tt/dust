import type { SessionWithUser } from "@app/lib/iam/provider";
import { resolveSession } from "@front-api/middleware/session_resolution";
import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    session: SessionWithUser;
  }
}

/**
 * Resolves a session (bearer token or cookie) and stores the resulting
 * `SessionWithUser` on the Hono context under the `session` variable.
 *
 * Mirrors `withSessionAuthentication` in `front/lib/api/auth_wrappers.ts`.
 * Apply to routes that need a logged-in user but no workspace scoping.
 */
export const sessionAuth: MiddlewareHandler = async (c, next) => {
  const result = await resolveSession(c);
  if (result instanceof Response) {
    return result;
  }

  c.set("session", result);
  await next();
};
