import type { MiddlewareHandler } from "hono";

import type { Authenticator } from "@app/lib/auth";

type Role = "user" | "builder" | "admin";

const ROLE_CHECK: Record<Role, (auth: Authenticator) => boolean> = {
  user: (auth) => auth.isUser(),
  builder: (auth) => auth.isBuilder(),
  admin: (auth) => auth.isAdmin(),
};

/**
 * Asserts the authenticated user has at least the given role. Apply after
 * the auth middleware so `c.get("auth")` is available.
 *
 * The error message is intentionally generic; if a route needs a more
 * specific message (e.g. tying it to a particular resource), do the check
 * inline in the handler instead.
 */
export function requireRole(role: Role): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!ROLE_CHECK[role](auth)) {
      return c.json(
        {
          error: {
            type: "workspace_auth_error",
            message: `This operation requires ${role} access to the workspace.`,
          },
        },
        403
      );
    }
    await next();
  };
}
