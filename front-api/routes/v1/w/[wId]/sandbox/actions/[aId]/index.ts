import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import {
  isSandboxExecTokenPayload,
  isSandboxFunctionInvocationTokenPayload,
} from "@app/lib/api/sandbox/access_tokens";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { SandboxFunctionMCPActionType } from "@app/types/api/sandbox_functions";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

type CallToolPendingResponse = {
  status: "pending";
  actionId: string;
};

type CallToolRejectedResponse = {
  status: "rejected";
};

type CallToolSuccessResponse = {
  status: "success";
  action: AgentMCPActionWithOutputType;
};

type CallToolSandboxFunctionSuccessResponse = {
  status: "success";
  action: SandboxFunctionMCPActionType & {
    output: CallToolResult["content"] | null;
    // Machine-readable payload of the tool result, when the tool provided one.
    structuredContent?: CallToolResult["structuredContent"];
  };
};

// Flavor-neutral on purpose: exec tokens poll AgentMCPActions (conversation sandboxes) and
// invocation tokens poll SandboxFunctionMCPActions, through the same handler and wire contract.
export type GetSandboxActionResponseType =
  | CallToolSuccessResponse
  | CallToolSandboxFunctionSuccessResponse
  | CallToolPendingResponse
  | CallToolRejectedResponse;

// Mounted at /api/v1/w/:wId/sandbox/actions/:aId.
const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetSandboxActionResponseType> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");

    const { aId } = ctx.req.valid("param");

    if (isSandboxFunctionInvocationTokenPayload(claims)) {
      const action = await SandboxFunctionMCPActionResource.fetchById(
        auth,
        aId
      );
      // Scope the lookup to the token's invocation so a token cannot read actions of other
      // invocations in the same workspace.
      if (!action || action.invocationId !== claims.invocationId) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "action_not_found",
            message: "Action not found.",
          },
        });
      }

      switch (action.status) {
        case "running":
        case "blocked_authentication_required":
        case "blocked_validation_required":
          return ctx.json({ status: "pending", actionId: action.sId }, 202);
        case "succeeded":
        case "errored": {
          const outputResult = await action.readOutput();
          if (outputResult.isErr()) {
            return apiError(ctx, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to read the action output.",
              },
            });
          }
          const output = outputResult.value;
          return ctx.json(
            {
              status: "success",
              action: {
                ...action.toJSON(),
                output: output?.content ?? null,
                ...(output?.structuredContent !== undefined
                  ? { structuredContent: output.structuredContent }
                  : {}),
              },
            },
            200
          );
        }
        case "denied":
          return ctx.json({ status: "rejected" }, 403);
        default:
          assertNever(action.status);
      }
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

    const action = await AgentMCPActionResource.fetchById(auth, aId);
    if (!action) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "action_not_found",
          message: "Action not found.",
        },
      });
    }

    // Scope the action lookup to the token's agent message — prevents a token
    // leaking access to actions on other messages of the same workspace.
    if (
      !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo) ||
      action.stepContext.sandboxChildActionInfo?.parentActionId !==
        claims.actionId
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "action_not_found",
          message: "Action not found.",
        },
      });
    }

    if (!isToolExecutionStatusFinal(action.status)) {
      return ctx.json({ status: "pending", actionId: action.sId }, 202);
    }

    switch (action.status) {
      case "succeeded":
      case "errored": {
        const [enriched] =
          await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
            actions: [action],
            ignoreContent: false,
          });
        return ctx.json({ status: "success", action: enriched }, 200);
      }
      case "denied":
        return ctx.json({ status: "rejected" }, 403);
      default:
        assertNever(action.status);
    }
  }
);

export default app;
