import type { MiddlewareHandler } from "hono";

import { fetchUserFromSession } from "@app/lib/iam/users";
import type { UserResource } from "@app/lib/resources/user_resource";

declare module "hono" {
  interface ContextVariableMap {
    user: UserResource;
  }
}

/**
 * Resolves the `UserResource` for the current session (Redis-cached lookup)
 * and stores it on the Hono context as `user`.
 *
 * Kept intentionally lightweight — heavier `getUserWithWorkspaces` is opt-in
 * per-handler to avoid the workspace fan-out on every session-authed request.
 *
 * Must run after `sessionAuth` — expects `c.get("session")` to be set.
 */
export const userAuth: MiddlewareHandler = async (c, next) => {
  const session = c.get("session");
  const user = await fetchUserFromSession(session);

  if (!user) {
    return c.json(
      {
        error: {
          type: "not_authenticated",
          message: "The user could not be resolved from the session.",
        },
      },
      401
    );
  }

  c.set("user", user);
  await next();
};
