import { hasFeatureFlag } from "@app/lib/auth";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Gate a route on a single `WhitelistableFeature`. Apply after `workspaceAuth`
 * so `ctx.get("auth")` is available.
 */
export function withFeatureFlag(
  flag: WhitelistableFeature,
  { message }: { message?: string } = {}
) {
  return createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");

    if (!(await hasFeatureFlag(auth, flag))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message:
            message ?? `Feature '${flag}' is not enabled for this workspace.`,
        },
      });
    }

    await next();
  });
}
