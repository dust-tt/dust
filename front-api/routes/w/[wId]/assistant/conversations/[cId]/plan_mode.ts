import { Hono } from "hono";

import {
  PLAN_MODE_SERVER_NAME,
  REQUEST_PLAN_APPROVAL_TOOL_NAME,
} from "@app/lib/api/actions/servers/plan_mode/metadata";
import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import { findActivePlanFile } from "@app/lib/api/assistant/plan_mode";
import { getFileContent } from "@app/lib/api/files/utils";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";

import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";

export type PlanApprovalState = "draft" | "pending" | "approved";

// Mounted at /api/w/:wId/assistant/conversations/:cId/plan_mode.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const cId = c.req.param("cId") ?? "";

  // Ensure the caller has access to the conversation.
  const conversationRes = await getLightConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(c, conversationRes.error);
  }

  const planFile = await findActivePlanFile(auth, cId);
  if (!planFile) {
    return c.json({
      planFile: null,
      content: null,
      approvalState: "draft" as PlanApprovalState,
    });
  }

  // Sequential fetches to avoid holding multiple DB connections from the pool simultaneously.
  const content = await getFileContent(auth, planFile, "original");
  const conversationResource = await ConversationResource.fetchById(auth, cId);
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

  return c.json({
    planFile: planFile.toJSON(auth),
    content,
    approvalState,
  });
});

export default app;
