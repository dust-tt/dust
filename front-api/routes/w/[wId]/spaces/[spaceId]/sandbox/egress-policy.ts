import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  readPodSpacePolicy,
  writePodSpacePolicy,
} from "@app/lib/api/sandbox/egress_policy";
import type {
  GetPodEgressPolicyResponseBody,
  PutPodEgressPolicyResponseBody,
} from "@app/types/api/sandbox/egress_policy";
import { parseEgressPolicy } from "@app/types/sandbox/egress_policy";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox/egress-policy. The parent
// sandbox sub-app applies the workspace-admin and `sandbox_functions` gates;
// each handler additionally validates that the space is a Pod (project
// space). Mirrors the workspace egress-policy route: the GCS policy file is
// the store, read and written directly.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetPodEgressPolicyResponseBody> => {
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Pod egress policy is only available for project spaces.",
        },
      });
    }

    const result = await readPodSpacePolicy(space.sId);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to read pod egress policy: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ policy: result.value });
  }
);

app.put(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<PutPodEgressPolicyResponseBody> => {
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Pod egress policy is only available for project spaces.",
        },
      });
    }

    const body = await ctx.req.json().catch(() => null);
    const parsedPolicy = parseEgressPolicy(body);
    if (parsedPolicy.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid pod egress policy: ${parsedPolicy.error.message}`,
        },
      });
    }

    const result = await writePodSpacePolicy(space.sId, {
      policy: parsedPolicy.value,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to write pod egress policy: ${result.error.message}`,
        },
      });
    }

    const auth = ctx.get("auth");
    void emitAuditLogEvent({
      auth,
      action: "pod_egress_policy.updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("space", space),
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
