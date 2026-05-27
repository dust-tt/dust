import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Role-check middlewares for Hono route handlers.
 *
 * Must be applied after `workspaceAuth` so `ctx.get("auth")` is set.
 */

export const ensureIsAdmin = () =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only users that are `admins` can perform this action.",
        },
      });
    }

    await next();
  });

export const ensureIsBuilder = () =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.isBuilder()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `builders` can perform this action.",
        },
      });
    }

    await next();
  });

export const ensureIsUser = () =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.isUser()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "workspace_auth_error",
          message: "You must be authenticated to perform this action.",
        },
      });
    }

    await next();
  });

export const ensureIsDustSuperUser = () =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.isDustSuperUser()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only Dust super users can perform this action.",
        },
      });
    }

    await next();
  });
