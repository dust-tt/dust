import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { createSandboxChildAction } from "@app/lib/api/sandbox/create_child_action";
import logger from "@app/logger/logger";
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
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot access sandbox actions.",
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
