import {
  PLAN_MODE_SERVER_NAME,
  REQUEST_PLAN_APPROVAL_TOOL_NAME,
} from "@app/lib/api/actions/servers/plan_mode/metadata";
import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { GetConversationPlanModeResponseBody } from "@app/lib/api/assistant/plan_mode";
import {
  derivePlanApprovalState,
  findActivePlan,
  getPlanContent,
  isApprovalRequestStale,
} from "@app/lib/api/assistant/plan_mode";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/plan_mode.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetConversationPlanModeResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversationRes = await getLightConversation(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }
    const conversation = conversationRes.value;

    const plan = await findActivePlan(auth, conversation);
    if (!plan) {
      return ctx.json({
        plan: null,
        content: null,
        approvalState: "none",
      });
    }

    // Sequential fetches to avoid holding multiple DB connections from the pool simultaneously.
    const contentRes = await getPlanContent(auth, conversation, plan);
    if (contentRes.isErr()) {
      // A missing file is Ok(null); an Err here is a real read failure, surfaced not silenced.
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to read the plan content.",
          },
        },
        contentRes.error
      );
    }
    const content = contentRes.value;

    const conversationResource = await ConversationResource.fetchById(
      auth,
      cId
    );
    const blockedActions = conversationResource
      ? await AgentMCPActionResource.listBlockedActionsForConversation(
          auth,
          conversationResource
        )
      : [];

    // A stale request would be rejected by the handler, so it must not show as "pending". Mirrors
    // the handler's staleness check (`action.created` === the action's `createdAt`).
    const hasPendingApproval = blockedActions.some(
      (a) =>
        a.metadata.mcpServerName === PLAN_MODE_SERVER_NAME &&
        a.metadata.toolName === REQUEST_PLAN_APPROVAL_TOOL_NAME &&
        !isApprovalRequestStale(plan, { requestedAtMs: a.created })
    );

    return ctx.json({
      plan: { version: plan.version },
      content,
      approvalState: derivePlanApprovalState(plan, { hasPendingApproval }),
    });
  }
);

export default app;
