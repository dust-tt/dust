import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Gate a handler to builder-or-above access. Must be applied after
 * `workspaceAuth` so `ctx.get("auth")` is set.
 */
export const ensureIsBuilder = () =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.isBuilder()) {
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
