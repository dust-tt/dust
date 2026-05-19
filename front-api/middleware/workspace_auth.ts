import type { MiddlewareHandler } from "hono";

import { Authenticator } from "@app/lib/auth";
import { getClientIp } from "@app/lib/utils/request";

import { resolveSession } from "@front-api/middleware/session_resolution";
import { apiError } from "@front-api/middleware/utils";

declare module "hono" {
  interface ContextVariableMap {
    auth: Authenticator;
  }
}

/**
 * Authenticates a workspace-scoped request and stores the resolved
 * `Authenticator` on the Hono context under the `auth` variable.
 *
 * Mirrors the behavior of `withSessionAuthenticationForWorkspace` in
 * `front/lib/api/auth_wrappers.ts`. Apply to any route under
 * `/api/w/:wId/...`.
 */
export const workspaceAuth: MiddlewareHandler = async (c, next) => {
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

  const auth = await Authenticator.fromSession(sessionResult, wId);

  const headers: Record<string, string | string[] | undefined> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const ip = getClientIp({ headers });
  if (ip !== "internal") {
    auth.setClientIp(ip);
  }

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: "workspace_auth_error",
        message: "Only users of the workspace can access this content.",
      },
    });
  }

  c.set("auth", auth);
  await next();
};
