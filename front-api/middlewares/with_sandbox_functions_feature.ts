import { getFeatureFlags } from "@app/lib/auth";
import type {
  PublicApiCtx,
  WorkspaceAwareCtx,
} from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

// Gates a route behind the `sandbox_functions` feature flag. This is the flag
// for the newer Sandbox Functions surface (including the pod-level sandbox
// admin), distinct from the workspace Computer admin gated by
// `withComputerFeature`.
export function withSandboxFunctionsFeature({
  message = "Sandbox Functions are disabled for this workspace.",
}: {
  message?: string;
} = {}) {
  return createMiddleware<PublicApiCtx | WorkspaceAwareCtx>(
    async (ctx, next) => {
      const auth = ctx.get("auth");
      const featureFlags = await getFeatureFlags(auth);

      if (!featureFlags.includes("sandbox_functions")) {
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

/** Invocation routes are shared while Frames v2 progressively replaces Pod Functions. */
export function withSandboxFunctionInvocationFeature() {
  return createMiddleware<PublicApiCtx | WorkspaceAwareCtx>(
    async (ctx, next) => {
      const featureFlags = await getFeatureFlags(ctx.get("auth"));
      if (
        !featureFlags.includes("sandbox_functions") &&
        !featureFlags.includes("frames_v2")
      ) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message: "Sandbox Functions are not enabled for this workspace.",
          },
        });
      }
      await next();
    }
  );
}
