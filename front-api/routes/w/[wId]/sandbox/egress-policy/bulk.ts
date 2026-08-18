import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  bulkUpdateEgressDomain,
  parseSandboxAdminPodSelection,
  resolveSandboxAdminPods,
  SandboxAdminPodSelectionQuerySchema,
} from "@app/lib/api/sandbox/admin_pods";
import { readOwnerPolicy } from "@app/lib/api/sandbox/egress_policy";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  GetPodEgressPoliciesBulkResponseBody,
  PostBulkEgressPolicyResponseBody,
} from "@app/types/api/sandbox/egress_policy";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { z } from "zod";

// Mounted at /api/w/:wId/sandbox/egress-policy/bulk. Multi-pod read (GET) and
// add/remove write (POST) for the central Computer admin page. The parent
// sub-app applies the workspace-admin + Computer gates; the multi-Pod feature
// is gated on the Pod Functions (sandbox_functions) flag.
const app = workspaceApp();

app.use("*", withFeatureFlag("sandbox_functions"));

const PostBulkEgressPolicyBodySchema = z.object({
  includeWorkspace: z.boolean(),
  podIds: z.array(z.string()).max(100),
  operation: z.discriminatedUnion("operation", [
    z.object({ operation: z.literal("add"), domain: z.string().min(1) }),
    z.object({ operation: z.literal("remove"), domain: z.string().min(1) }),
  ]),
});

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

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostBulkEgressPolicyBodySchema),
  async (ctx): HandlerResult<PostBulkEgressPolicyResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const results = await bulkUpdateEgressDomain(auth, {
      includeWorkspace: body.includeWorkspace,
      podIds: [...new Set(body.podIds)],
      operation: body.operation,
      context: getAuditLogContext(auth),
    });

    return ctx.json({ results });
  }
);

export default app;
