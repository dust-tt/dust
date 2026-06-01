import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
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

export type FetchConversationMessageActionResponse =
  | CallToolSuccessResponse
  | CallToolPendingResponse
  | CallToolRejectedResponse;

// Mounted at /api/v1/w/:wId/sandbox/actions/:aId. sandboxAuth is applied by
// the parent sandbox sub-app, so ctx.get("auth") and ctx.get("sandboxClaims")
// are always available here.
const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<FetchConversationMessageActionResponse> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");

    const { aId } = ctx.req.valid("param");

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
