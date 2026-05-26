import { hasFeatureFlag } from "@app/lib/auth";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type {
  PublicApiCtx,
  WorkspaceAwareCtx,
} from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Gate a route on a single `WhitelistableFeature`. Apply after any auth
 * middleware that sets `ctx.get("auth")` — works with both workspace-aware
 * and public-API contexts.
 */
export function withFeatureFlag(
  flag: WhitelistableFeature,
  { message }: { message?: string } = {}
) {
  return createMiddleware<PublicApiCtx | WorkspaceAwareCtx>(
    async (ctx, next) => {
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
    }
  );
}
