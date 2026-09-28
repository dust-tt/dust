import { getFeatureFlags } from "@app/lib/auth";
import { isFramesV2FunctionsEnabled } from "@app/types/shared/feature_flags";
import type {
  PublicApiCtx,
  WorkspaceAwareCtx,
} from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Gate a route on Frame functions (frames_v2 + frames_v2_functions). Apply after any auth
 * middleware that sets `ctx.get("auth")`.
 */
export function withFramesV2FunctionsFeature() {
  return createMiddleware<PublicApiCtx | WorkspaceAwareCtx>(
    async (ctx, next) => {
      const featureFlags = await getFeatureFlags(ctx.get("auth"));
      if (!isFramesV2FunctionsEnabled(featureFlags)) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message: "Frame functions are not enabled for this workspace.",
          },
        });
      }
      await next();
    }
  );
}
