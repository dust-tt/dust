import { verifySandboxExecToken } from "@app/lib/api/sandbox/access_tokens";
import { createSandboxChildAction } from "@app/lib/api/sandbox/create_child_action";
import { getFeatureFlags } from "@app/lib/auth";
import { CallMCPToolRequestBodySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

type CallSandboxToolResponse = {
  status: "pending";
  actionId: string;
};

// Mounted at /api/v1/w/:wId/sandbox/actions/call. publicApiAuth is applied by
// the parent v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", CallMCPToolRequestBodySchema),
  async (ctx): HandlerResult<CallSandboxToolResponse> => {
    const auth = ctx.get("auth");

    const token = ctx.req.header("authorization")?.replace("Bearer ", "");
    if (!token) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message:
            "The request does not have valid authentication credentials.",
        },
      });
    }

    const claims = await verifySandboxExecToken(token);
    if (!claims) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message: "The sandbox token is invalid or expired.",
        },
      });
    }

    const featureFlags = await getFeatureFlags(auth);
    if (!featureFlags.includes("sandbox_dsbx_tools")) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "Sandbox dsbx tools are not enabled for this workspace.",
        },
      });
    }

    const {
      serverViewId,
      toolName,
      arguments: toolArgs,
    } = ctx.req.valid("json");

    const result = await createSandboxChildAction(auth, {
      parentActionId: claims.actionId,
      agentId: claims.aId,
      conversationId: claims.cId,
      agentMessageId: claims.mId,
      serverViewId,
      toolName,
      rawInputs: toolArgs ?? {},
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json(
      { status: "pending", actionId: result.value.actionId },
      202
    );
  }
);

export default app;
