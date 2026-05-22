import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  readWorkspacePolicy,
  writeWorkspacePolicy,
} from "@app/lib/api/sandbox/egress_policy";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import { parseEgressPolicy } from "@app/types/sandbox/egress_policy";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type GetWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

export type PutWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

// Mounted at /api/w/:wId/sandbox/egress-policy.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetWorkspaceEgressPolicyResponseBody> => {
    const auth = ctx.get("auth");

    const result = await readWorkspacePolicy(auth);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to read sandbox egress policy: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ policy: result.value });
  }
);

app.put(
  "/",
  async (ctx): HandlerResult<PutWorkspaceEgressPolicyResponseBody> => {
    const auth = ctx.get("auth");
    const workspace = auth.getNonNullableWorkspace();

    const body = await ctx.req.json().catch(() => null);
    const parsedPolicy = parseEgressPolicy(body);
    if (parsedPolicy.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid sandbox egress policy: ${parsedPolicy.error.message}`,
        },
      });
    }

    const result = await writeWorkspacePolicy(auth, {
      policy: parsedPolicy.value,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to write sandbox egress policy: ${result.error.message}`,
        },
      });
    }

    void emitAuditLogEvent({
      auth,
      action: "sandbox_egress_policy.updated",
      targets: [
        buildAuditLogTarget("workspace", workspace),
        {
          type: "sandbox_egress_policy",
          id: workspace.sId,
          name: "Sandbox egress policy",
        },
      ],
      context: getAuditLogContext(auth),
      metadata: {
        allowed_domain_count: String(result.value.allowedDomains.length),
        allowed_domains: result.value.allowedDomains.join(","),
      },
    });

    return ctx.json({ policy: result.value });
  }
);

export default app;
