import type { Permission } from "@app/types/permissions";
import type {
  PublicApiCtx,
  WorkspaceAwareCtx,
} from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Role-check middlewares for Hono route handlers.
 *
 * Must be applied after `workspaceAuth` so `ctx.get("auth")` is set.
 */

export const ENSURE_IS_ADMIN_ERROR_MESSAGE =
  "Only admin users can perform this action.";

export const ENSURE_IS_BUILDER_ERROR_MESSAGE =
  "Only builder users can perform this action.";

export const ensureIsAdmin = () =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: ENSURE_IS_ADMIN_ERROR_MESSAGE,
        },
      });
    }

    await next();
  });

export const ensureHasPermission = (permission: Permission) =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.hasPermission(permission)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You do not have permission to perform this action.",
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
          message: ENSURE_IS_BUILDER_ERROR_MESSAGE,
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

export const ensureIsSystemKey = () =>
  createMiddleware<PublicApiCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_oauth_token_error",
          message: "Only system keys can perform this action.",
        },
      });
    }

    await next();
  });
