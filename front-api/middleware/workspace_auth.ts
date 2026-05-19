import { apiError } from "@front-api/middleware/utils";
import type { MiddlewareHandler } from "hono";

import {
  Authenticator,
  getSession,
  getSessionFromBearerToken,
} from "@app/lib/auth";
import { getClientIp } from "@app/lib/utils/request";

import { buildNextLikeReqRes } from "./utils";

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

  const { req, res, setCookies } = buildNextLikeReqRes(c);

  // Try bearer token first, then fall back to cookie-based session.
  // Mirrors withLogging in front/logger/withlogging.ts.
  const bearerRes = await getSessionFromBearerToken(
    c.req.header("authorization")
  );
  if (bearerRes.isErr()) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: bearerRes.error,
        message: "The request does not have valid authentication credentials.",
      },
    });
  }
  const session = bearerRes.value ?? (await getSession(req, res));

  for (const cookie of setCookies) {
    c.header("Set-Cookie", cookie, { append: true });
  }

  if (!session) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message:
          "The user does not have an active session or is not authenticated.",
      },
    });
  }

  const auth = await Authenticator.fromSession(session, wId);

  const ip = getClientIp(req);
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
