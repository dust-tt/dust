import {
  isSandboxExecTokenPayload,
  isSandboxFunctionInvocationTokenPayload,
} from "@app/lib/api/sandbox/access_tokens";
import { createSandboxChildAction } from "@app/lib/api/sandbox/create_child_action";
import { createSandboxFunctionMCPAction } from "@app/lib/api/sandbox_functions/create_sandbox_function_mcp_action";
import { selfHealSandboxFunctionExecutionMode } from "@app/lib/api/sandbox_functions/self_heal_execution_mode";
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
      idempotencyKey,
    } = ctx.req.valid("json");

    // Sandbox function invocations have no conversation: the action and any approval event are
    // scoped to the invocation. The sandbox is never paused (function invocations are blocking
    // execs), so the response can be returned directly.
    if (isSandboxFunctionInvocationTokenPayload(claims)) {
      // A fast function is published on the promise that it does not call tools, and its
      // invocation cannot survive the wait a tool call can turn into. Refusing on the token
      // rather than in the sandbox makes this hold however the function is invoked.
      //
      // This is a guardrail against a mislabelled function, not a sandbox boundary: every
      // invocation execs as the same user, so a fast function running alongside a durable one
      // could read that invocation's token out of /proc. That grants nothing the pod owner could
      // not get by publishing as durable, and the tool call still needs its usual approval.
      if (claims.noTools) {
        if (claims.frameId) {
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "fast_function_called_tools",
              message:
                "This Frame function was published as fast, which cannot call tools, so this " +
                "call was refused. Republish the Frame with executionMode `durable`.",
            },
          });
        }
        // The declaration was wrong, and only this refusal reveals it. Record the function as
        // durable so the next invocation works, without holding up the refusal this one gets.
        void selfHealSandboxFunctionExecutionMode(auth, {
          sandboxFunctionId: claims.sandboxFunctionId,
          invocationId: claims.invocationId,
        }).catch((err) =>
          logger.error(
            {
              err,
              sandboxFunctionId: claims.sandboxFunctionId,
              invocationId: claims.invocationId,
            },
            "Failed to record a Pod function as durable"
          )
        );

        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "fast_function_called_tools",
            message:
              "This Pod function was published as fast, which cannot call tools, so this call " +
              "was refused. The function is now recorded as durable: retrying the invocation " +
              "will work without a republish. Republish with executionMode `durable` only to " +
              "make the source's declaration match.",
          },
        });
      }

      const result = await createSandboxFunctionMCPAction(auth, {
        sandboxFunctionId: claims.sandboxFunctionId,
        invocationId: claims.invocationId,
        runtimeSpaceId: claims.spaceId,
        serverViewId,
        toolName,
        rawInputs: toolArgs ?? {},
        idempotencyKey,
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

    // `idempotencyKey` only deduplicates function-invocation calls today: child actions live on
    // the agent-loop's action model, which does not carry the key.
    const result = await createSandboxChildAction(auth, {
      parentActionId: claims.actionId,
      agentId: claims.aId,
      agentVersion: claims.aV,
      conversationId: claims.cId,
      agentMessageId: claims.mId,
      serverViewId,
      toolName,
      rawInputs: toolArgs ?? {},
    });

    if (result.isErr()) {
      logger.error(
        {
          err: result.error,
          conversationId: claims.cId,
          agentMessageId: claims.mId,
          parentActionId: claims.actionId,
          serverViewId,
          toolName,
        },
        "Failed to create sandbox child action"
      );

      return apiError(
        ctx,
        {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        },
        result.error
      );
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
