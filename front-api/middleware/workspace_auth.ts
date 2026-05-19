import type { MiddlewareHandler } from "hono";

import {
  ASSISTANT_CONVERSATION_ROUTE_FRAGMENT,
  validateWorkspace,
} from "@app/lib/api/auth_wrappers";
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
 * `front/lib/api/auth_wrappers.ts`. Apply once at the top of each sub-app
 * under `/api/w/:wId/...` (the parent `[wId]/index.ts` does NOT carry a
 * wildcard) — this lets each sub-app declare its own auth requirements
 * locally, the same way each Next handler passes its own opts to
 * `withSessionAuthenticationForWorkspace`.
 *
 * Options mirror `withSessionAuthenticationForWorkspace`:
 * - `doesNotRequireCanUseProduct`: when true, the `canUseProduct` paywall
 *   gate is bypassed (use only for endpoints the user must reach while
 *   paywalled, e.g. subscription/upgrade flows).
 */
export function workspaceAuth(opts?: {
  doesNotRequireCanUseProduct?: boolean;
}): MiddlewareHandler {
  return async (c, next) => {
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

    // For routes under /assistant/conversations/:cId, surface the cId so
    // validateWorkspace can enforce the per-conversation kill switch.
    const conversationId = c.req.path.includes(
      ASSISTANT_CONVERSATION_ROUTE_FRAGMENT
    )
      ? (c.req.param("cId") ?? null)
      : null;

    const workspaceError = validateWorkspace(auth, {
      doesNotRequireCanUseProduct: opts?.doesNotRequireCanUseProduct,
      conversationId,
    });
    if (workspaceError) {
      return apiError(c, workspaceError);
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
}
