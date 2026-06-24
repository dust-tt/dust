import { getFeatureFlags } from "@app/lib/auth";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import type {
  PublicApiCtx,
  WorkspaceAwareCtx,
} from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

export function withComputerFeature({
  message = "Sandbox tools are not enabled for this workspace.",
}: {
  message?: string;
} = {}) {
  return createMiddleware<PublicApiCtx | WorkspaceAwareCtx>(
    async (ctx, next) => {
      const auth = ctx.get("auth");
      const featureFlags = await getFeatureFlags(auth);

      if (!isComputerFeatureEnabled(featureFlags)) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message,
          },
        });
      }

      await next();
    }
  );
}
