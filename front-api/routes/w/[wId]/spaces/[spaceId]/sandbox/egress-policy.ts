import {
  getPodEgressDomains,
  setPodEgressDomains,
} from "@app/lib/api/sandbox/pod_egress_policy";
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
// each handler additionally validates that the space is a Pod (project space).
const app = workspaceApp();

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

    const allowedDomains = await getPodEgressDomains(auth, space);

    return ctx.json({ policy: { allowedDomains } });
  }
);

app.put(
  "/",
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

    const result = await setPodEgressDomains(
      auth,
      space,
      parsedPolicy.value.allowedDomains
    );
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid pod egress policy: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ policy: result.value });
  }
);

export default app;
