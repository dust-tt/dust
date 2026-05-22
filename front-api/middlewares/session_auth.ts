import type { SessionCtx } from "@front-api/middlewares/ctx";
import { resolveSession } from "@front-api/middlewares/session_resolution";
import { createMiddleware } from "hono/factory";

/**
 * Resolves a session (bearer token or cookie) and stores the resulting
 * `SessionWithUser` on the Hono context under the `session` variable.
 *
 * Mirrors `withSessionAuthentication` in `front/lib/api/auth_wrappers.ts`.
 * Apply to routes that need a logged-in user but no workspace scoping.
 */
export const sessionAuth = createMiddleware<SessionCtx>(async (ctx, next) => {
  const result = await resolveSession(ctx);
  if (result instanceof Response) {
    return result;
  }

  ctx.set("session", result);
  await next();
});
