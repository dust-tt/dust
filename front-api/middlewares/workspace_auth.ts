import type { WorkspaceAccessError } from "@app/lib/api/workspace_validation";
import {
  getAssistantConversationIdFromUrl,
  validateWorkspaceAccess,
} from "@app/lib/api/workspace_validation";
import { Authenticator } from "@app/lib/auth";
import { getClientIp } from "@app/lib/utils/request";
import type { APIErrorWithStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { resolveSession } from "@front-api/middlewares/session_resolution";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

function workspaceAccessErrorToApiError(
  err: WorkspaceAccessError
): APIErrorWithStatusCode {
  switch (err.type) {
    case "workspace_not_found":
      return {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      };
    case "workspace_cannot_use_product":
      return {
        status_code: 403,
        api_error: {
          type: "workspace_can_use_product_required_error",
          message:
            "Your current plan does not allow API access. Please upgrade your plan.",
        },
      };
    case "maintenance":
      // During relocation we return 503, but once relocation-done the workspace
      // should be treated as if it no longer existed in this region (matches
      // what happens once it gets purged), and avoids constant alerts from
      // clients still hitting the old endpoint.
      if (err.maintenance === "relocation-done") {
        return {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: `The workspace was not found. [${err.maintenance}]`,
          },
        };
      }
      return {
        status_code: 503,
        api_error: {
          type: "service_unavailable",
          message: `Service is currently unavailable. [${err.maintenance}]`,
        },
      };
    case "workspace_kill_switched":
      return {
        status_code: 503,
        api_error: {
          type: "service_unavailable",
          message:
            "Access to this workspace has been disabled for emergency maintenance.",
        },
      };
    case "conversation_kill_switched":
      return {
        status_code: 503,
        api_error: {
          type: "service_unavailable",
          message:
            "Access to this conversation has been disabled for emergency maintenance.",
        },
      };
    default:
      return assertNever(err);
  }
}

interface WorkspaceAuthOptions {
  doesNotRequireCanUseProduct?: boolean;
  allowMissingWorkspace?: boolean;
}

/**
 * Authenticates a workspace-scoped request and stores the resolved
 * `Authenticator` (and the underlying session) on the Hono context.
 *
 * Mirrors `withSessionAuthenticationForWorkspace` in `front/lib/api/auth_wrappers.ts`.
 *
 * Returns a middleware factory so options can be passed at the route level.
 * The middleware is idempotent: if `ctx.var.auth` is already set by an earlier
 * call in the chain (e.g. a path-specific override registered before the
 * catch-all), it short-circuits.
 */
export const workspaceAuth = (opts: WorkspaceAuthOptions = {}) =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    if (ctx.get("auth")) {
      return next();
    }

    const wId = ctx.req.param("wId");
    if (!wId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    }

    const sessionResult = await resolveSession(ctx);
    if (sessionResult instanceof Response) {
      return sessionResult;
    }

    const auth = await Authenticator.fromSession(sessionResult, wId);

    const headers: Record<string, string | string[] | undefined> = {};
    ctx.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const ip = getClientIp({ headers });
    if (ip !== "internal") {
      auth.setClientIp(ip);
    }

    if (opts.allowMissingWorkspace && (!auth.workspace() || !auth.plan())) {
      ctx.set("auth", auth);
      ctx.set("session", sessionResult);
      return next();
    }

    const workspaceError = validateWorkspaceAccess(auth, {
      doesNotRequireCanUseProduct: opts.doesNotRequireCanUseProduct,
      conversationId: getAssistantConversationIdFromUrl(
        ctx.req.path,
        ctx.req.param("cId")
      ),
    });
    if (workspaceError) {
      return apiError(ctx, workspaceAccessErrorToApiError(workspaceError));
    }

    if (!auth.user()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_user_not_found",
          message: "Could not find the user of the current session.",
        },
      });
    }

    if (!auth.isUser()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "workspace_auth_error",
          message: "Only users of the workspace can access this content.",
        },
      });
    }

    ctx.set("auth", auth);
    ctx.set("session", sessionResult);
    await next();
  });
