import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

interface EnsureRoleOptions {
  admin?: boolean;
  builder?: boolean;
}

/**
 * Gate a sub-app or handler on the caller's workspace role. Must be applied
 * after `workspaceAuth` so `ctx.get("auth")` is set.
 */
export const ensureRole = (opts: EnsureRoleOptions) =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (opts.admin && !auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access this endpoint.",
        },
      });
    }

    if (opts.builder && !auth.isBuilder()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `builders` or `admins` for the current workspace can access this endpoint.",
        },
      });
    }

    await next();
  });
