import type { APIErrorType } from "@app/types/error";
import type {
  ConcreteResourceType,
  GrantVerb,
} from "@app/types/group_permissions";
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

export const ENSURE_IS_MANAGER_ERROR_MESSAGE =
  "Only managers can perform this action.";

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

export const ensureIsManager = () =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.isManager()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: ENSURE_IS_MANAGER_ERROR_MESSAGE,
        },
      });
    }

    await next();
  });

/**
 * Guards a route on a workspace-level governance capability (a type-wide grant),
 * e.g. `ensureHasWorkspacePermission("admin", "billing", "...")`. Prefer this over
 * the role middlewares for capability-based access.
 *
 * `errorType` defaults to `workspace_auth_error`; pass `app_auth_error` for the
 * skills endpoints, which use that error type throughout.
 */
export const ensureHasWorkspacePermission = (
  verb: GrantVerb,
  resourceType: ConcreteResourceType,
  message: string,
  errorType: APIErrorType = "workspace_auth_error"
) =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!(await auth.hasWorkspacePermission(verb, resourceType))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: errorType,
          message,
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
