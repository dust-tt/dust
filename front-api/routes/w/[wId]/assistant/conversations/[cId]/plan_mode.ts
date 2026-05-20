import {
  PLAN_MODE_SERVER_NAME,
  REQUEST_PLAN_APPROVAL_TOOL_NAME,
} from "@app/lib/api/actions/servers/plan_mode/metadata";
import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import { findActivePlanFile } from "@app/lib/api/assistant/plan_mode";
import { getFileContent } from "@app/lib/api/files/utils";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileType } from "@app/types/files";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PlanApprovalState = "draft" | "pending" | "approved";

export type GetConversationPlanModeResponseBody = {
  planFile: FileType | null;
  content: string | null;
  approvalState: PlanApprovalState;
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/plan_mode.
const app = new Hono();

app.get(
  "/",
  async (ctx): HandlerResult<GetConversationPlanModeResponseBody> => {
    const auth = ctx.get("auth");
    const cId = ctx.req.param("cId") ?? "";

    // Ensure the caller has access to the conversation.
    const conversationRes = await getLightConversation(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const planFile = await findActivePlanFile(auth, cId);
    if (!planFile) {
      return ctx.json({
        planFile: null,
        content: null,
        approvalState: "draft" as PlanApprovalState,
      });
    }

    // Sequential fetches to avoid holding multiple DB connections from the pool simultaneously.
    const content = await getFileContent(auth, planFile, "original");
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

    const hasPendingApproval = blockedActions.some(
      (a) =>
        a.metadata.mcpServerName === PLAN_MODE_SERVER_NAME &&
        a.metadata.toolName === REQUEST_PLAN_APPROVAL_TOOL_NAME
    );

    const approvalState: PlanApprovalState = hasPendingApproval
      ? "pending"
      : planFile.useCaseMetadata?.planModeLastApproval != null
        ? "approved"
        : "draft";

    return ctx.json({
      planFile: planFile.toJSON(auth),
      content,
      approvalState,
    });
  }
);

export default app;
