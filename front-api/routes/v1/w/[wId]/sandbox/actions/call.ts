import {
  isSandboxExecTokenPayload,
  isSandboxFunctionInvocationTokenPayload,
} from "@app/lib/api/sandbox/access_tokens";
import { createSandboxChildAction } from "@app/lib/api/sandbox/create_child_action";
import { createSandboxFunctionMCPAction } from "@app/lib/api/sandbox_functions/create_sandbox_function_mcp_action";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { CallMCPToolRequestBodySchema } from "@dust-tt/client";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

type CallSandboxToolResponse = {
  status: "pending";
  actionId: string;
};

// Mounted at /api/v1/w/:wId/sandbox/actions/call.
const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", CallMCPToolRequestBodySchema),
  async (ctx): HandlerResult<CallSandboxToolResponse> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");

    const {
      serverViewId,
      toolName,
      arguments: toolArgs,
    } = ctx.req.valid("json");

    // Sandbox function invocations have no conversation: the action is persisted on the
    // invocation and executed by a dedicated workflow. The sandbox is never paused (function
    // invocations are blocking execs) so the response can be returned directly.
    if (isSandboxFunctionInvocationTokenPayload(claims)) {
      const result = await createSandboxFunctionMCPAction(auth, {
        sandboxFunctionId: claims.sandboxFunctionId,
        invocationId: claims.invocationId,
        podSpaceId: claims.spaceId,
        serverViewId,
        toolName,
        rawInputs: toolArgs ?? {},
      });

      if (result.isErr()) {
        switch (result.error.type) {
          case "server_view_not_found":
          case "invocation_not_found":
            return apiError(ctx, {
              status_code: 404,
              api_error: {
                type: "invalid_request_error",
                message: result.error.message,
              },
            });
          case "tool_requires_approval":
            return apiError(ctx, {
              status_code: 403,
              api_error: {
                type: "invalid_request_error",
                message: result.error.message,
              },
            });
          case "tool_not_available":
          case "invalid_inputs":
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: result.error.message,
              },
            });
          default:
            assertNever(result.error.type);
        }
      }

      return ctx.json(
        { status: "pending" as const, actionId: result.value.actionId },
        202
      );
    }

    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot access sandbox actions.",
        },
      });
    }

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

    const { actionId, pauseSandbox } = result.value;

    // Pause the sandbox only AFTER the response is handed to the runtime.
    // `betaPause` freezes the in-sandbox `dsbx` client that issued this
    // request, and `dsbx` must receive `actionId` to start polling for the
    // result. node-server has no `executionCtx.waitUntil`, so we fire the
    // pause without awaiting; it sits behind a lock + several DB round-trips
    // before `provider.sleep`, so in practice the response is on the wire
    // before the sandbox freezes.
    if (pauseSandbox) {
      void pauseSandbox().catch((err) =>
        logger.error(
          { err, actionId },
          "Failed to pause sandbox for blocked sandbox-child"
        )
      );
    }

    return ctx.json({ status: "pending", actionId }, 202);
  }
);

export default app;
