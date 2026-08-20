import {
  listPodsWithEgressPolicy,
  parseSandboxAdminPodSelection,
  SandboxAdminPodSelectionQuerySchema,
} from "@app/lib/api/sandbox/admin_pods";
import { readOwnerPolicy } from "@app/lib/api/sandbox/egress_policy";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { GetPodEgressPoliciesBulkResponseBody } from "@app/types/api/sandbox/egress_policy";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

// Mounted at /api/w/:wId/sandbox/egress-policy/bulk. Multi-pod read (GET) for
// the central Computer admin page. The parent sub-app applies the
// workspace-admin + Computer gates; the multi-Pod feature is gated on the
// sandbox_functions flag. Only Pods with their own policy are read, so the
// selection is bounded by configured Pods rather than total Pods.
const app = workspaceApp();

app.use("*", withFeatureFlag("sandbox_functions"));

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

    const configuredPods = await listPodsWithEgressPolicy(auth);
    const targetPods =
      selection.value.kind === "all-pods"
        ? configuredPods
        : ((requested) =>
            configuredPods.filter((pod) => requested.has(pod.sId)))(
            new Set(selection.value.podIds)
          );

    // One GCS policy file per pod; bounded fan-out (only configured pods)
    // against an external service, not the DB.
    const reads = await concurrentExecutor(
      targetPods,
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
