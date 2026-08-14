import {
  parseSandboxAdminPodSelection,
  resolveSandboxAdminPods,
  SandboxAdminPodSelectionQuerySchema,
} from "@app/lib/api/sandbox/admin_pods";
import { readOwnerPolicy } from "@app/lib/api/sandbox/egress_policy";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { GetPodEgressPoliciesBulkResponseBody } from "@app/types/api/sandbox/egress_policy";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/sandbox/egress-policy/bulk. Read-only multi-pod
// view for the central Computer admin page's network comparison; the parent
// sandbox sub-app applies the workspace-admin and Computer-feature gates.
// Pod policy mutations stay on the single-pod route.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", SandboxAdminPodSelectionQuerySchema),
  async (ctx): HandlerResult<GetPodEgressPoliciesBulkResponseBody> => {
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
    // One GCS policy file per pod; bounded fan-out against an external
    // service, not the DB.
    const reads = await concurrentExecutor(
      pods,
      async (pod) => ({
        podId: pod.sId,
        result: await readOwnerPolicy(auth, pod.sId),
      }),
      { concurrency: 8 }
    );

    const policies: GetPodEgressPoliciesBulkResponseBody["policies"] = [];
    for (const { podId, result } of reads) {
      if (result.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to read pod egress policies: ${result.error.message}`,
          },
        });
      }
      policies.push({ podId, policy: result.value });
    }

    return ctx.json({ policies });
  }
);

export default app;
