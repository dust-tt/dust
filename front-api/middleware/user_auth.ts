import type { MiddlewareHandler } from "hono";

import { fetchUserFromSession } from "@app/lib/iam/users";
import type { UserResource } from "@app/lib/resources/user_resource";

declare module "hono" {
  interface ContextVariableMap {
    userResource: UserResource;
  }
}

/**
 * Resolves the `UserResource` for the current session and stores it on the
 * Hono context under the `userResource` variable.
 *
 * Must run after `sessionAuth` — expects `c.get("session")` to be set.
 * Handlers that need workspaces should call `getUserWithWorkspaces` themselves.
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

  c.set("userResource", user);
  await next();
};
