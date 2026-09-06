import { getFeatureFlags } from "@app/lib/auth";
import type {
  PublicApiCtx,
  WorkspaceAwareCtx,
} from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

export function withSandboxFunctionInvocationFeature() {
  return createMiddleware<PublicApiCtx | WorkspaceAwareCtx>(
    async (ctx, next) => {
      const featureFlags = await getFeatureFlags(ctx.get("auth"));
      if (!featureFlags.includes("frames_v2")) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message: "Frames are not enabled for this workspace.",
          },
        });
      }
      await next();
    }
  );
}
