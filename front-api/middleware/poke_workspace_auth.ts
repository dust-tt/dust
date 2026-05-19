import type { MiddlewareHandler } from "hono";

import { Authenticator } from "@app/lib/auth";

import { resolveSession } from "@front-api/middleware/session_resolution";
import { apiError } from "@front-api/middleware/utils";

/**
 * Authenticates a workspace-scoped Poke (super-user) request and stores the
 * resolved `Authenticator` on the Hono context under the `auth` variable.
 *
 * Combines the super-user gate of `pokeAuth` with workspace resolution from
 * `workspaceAuth`. Apply to any route under `/api/poke/workspaces/:wId/...`.
 */
export const pokeWorkspaceAuth: MiddlewareHandler = async (c, next) => {
  const wId = c.req.param("wId");
  if (!wId) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const sessionResult = await resolveSession(c);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const auth = await Authenticator.fromSuperUserSession(sessionResult, wId);

  if (!auth.isDustSuperUser()) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  }

  if (!auth.workspace()) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  c.set("auth", auth);
  await next();
};
