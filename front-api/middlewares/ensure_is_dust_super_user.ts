import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Gate a handler to Dust super users only. Must be applied after
 * `workspaceAuth` so `ctx.get("auth")` is set.
 */
export const ensureIsDustSuperUser = () =>
  createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!auth.isDustSuperUser()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only Dust super users can access this endpoint.",
        },
      });
    }

    await next();
  });
