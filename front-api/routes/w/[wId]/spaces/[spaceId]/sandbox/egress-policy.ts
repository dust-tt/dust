import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  dismissRequestedOwnerPolicyDomain,
  readOwnerPolicy,
  writeOwnerPolicy,
} from "@app/lib/api/sandbox/egress_policy";
import type {
  GetPodEgressPolicyResponseBody,
  PutPodEgressPolicyResponseBody,
} from "@app/types/api/sandbox/egress_policy";
import { parseEgressPolicy } from "@app/types/sandbox/egress_policy";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox/egress-policy. The parent
// sandbox sub-app applies the workspace-admin and Computer feature gates;
// each handler additionally validates that the space is a Pod (project
// space).
//
// A Pod's allowlist is its owner policy file
// (`w/{wId}/sandboxes/{spaceSId}.json`) — the same slot conversation
// sandboxes use for agent-approved domains, keyed by the pod's space sId. It
// survives sandbox destroy/recreate cycles, so nothing is written at sandbox
// activation. Mirrors the workspace egress-policy route.
const app = workspaceApp();

const DismissRequestBodySchema = z.object({
  domain: z.string().min(1),
});

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetPodEgressPolicyResponseBody> => {
    const auth = ctx.get("auth");
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

    const result = await readOwnerPolicy(auth, space.sId);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to read pod egress policy: ${result.error.message}`,
        },
      });
    }

    // Requests live in the same policy file (the proxy ignores the section).
    return ctx.json({
      policy: result.value,
      requestedDomains: (result.value.requestedDomains ?? []).map(
        ({ domain, requestedAtMs }) => ({ domain, requestedAtMs })
      ),
    });
  }
);

/** @ignoreswagger */
app.put(
  "/",
  ensureIsAdmin(),
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<PutPodEgressPolicyResponseBody> => {
    const auth = ctx.get("auth");
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

    const result = await writeOwnerPolicy(auth, {
      ownerId: space.sId,
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

    void emitAuditLogEvent({
      auth,
      action: "sandbox_egress_policy.updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        {
          type: "sandbox_egress_policy",
          id: space.sId,
          name: "Pod sandbox egress policy",
        },
      ],
      context: getAuditLogContext(auth),
      metadata: {
        allowed_domain_count: String(result.value.allowedDomains.length),
        allowed_domains: result.value.allowedDomains.join(","),
        // Pod-scoped policies carry their pod space sId; the workspace
        // policy omits the key entirely (same convention as
        // sandbox_env_var.* events).
        space_id: space.sId,
      },
    });

    return ctx.json({ policy: result.value });
  }
);

/** @ignoreswagger */
app.post(
  "/requests/dismiss",
  ensureIsAdmin(),
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<PutPodEgressPolicyResponseBody> => {
    const auth = ctx.get("auth");
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
    const parsedBody = DismissRequestBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: fromError(parsedBody.error).toString(),
        },
      });
    }

    const result = await dismissRequestedOwnerPolicyDomain(auth, {
      ownerId: space.sId,
      domain: parsedBody.data.domain,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to dismiss pod egress domain request: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ policy: result.value });
  }
);

export default app;
