import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Gate a handler to authenticated workspace users. Must be applied after
 * `workspaceAuth` so `ctx.get("auth")` is set.
 */
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
