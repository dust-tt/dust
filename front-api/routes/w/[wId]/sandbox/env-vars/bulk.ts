import {
  parseSandboxAdminPodSelection,
  resolveSandboxAdminPods,
  SandboxAdminPodSelectionQuerySchema,
} from "@app/lib/api/sandbox/admin_pods";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import type { GetSandboxEnvVarsBulkResponseBody } from "@app/types/api/sandbox/env_vars";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSandboxFunctionInvocationFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

// Mounted at /api/w/:wId/sandbox/env-vars/bulk. Multi-pod reads for the
// central Computer admin page. The parent sub-app applies the
// workspace-admin + Computer gates; the multi-Pod feature is gated on Frame
// functions (frames_v2 + frames_v2_functions), like the egress-policy bulk
// route. Values are never returned (write-only invariant).
const app = workspaceApp();

app.use("*", withSandboxFunctionInvocationFeature());

/** @ignoreswagger */
app.get(
  "/",
  validate("query", SandboxAdminPodSelectionQuerySchema),
  async (ctx): HandlerResult<GetSandboxEnvVarsBulkResponseBody> => {
    const auth = ctx.get("auth");

    const selection = parseSandboxAdminPodSelection(ctx.req.valid("query"));
    if (selection.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: selection.error.message,
        },
      });
    }

    const pods = await resolveSandboxAdminPods(auth, selection.value);
    const envVars = await SandboxEnvVarResource.listForPods(auth, pods);

    return ctx.json({
      envVars: envVars.map((envVar) => envVar.toJSON()),
    });
  }
);

export default app;
