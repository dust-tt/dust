/**
 * @ignoreswagger
 * Internal endpoint used by the UI to cancel plan mode on a conversation. Undocumented.
 */
import {
  getMCPApprovalStateFromUserApprovalState,
  isMCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import { EXIT_PLAN_MODE_TOOL_NAME } from "@app/lib/api/actions/servers/plan_mode/metadata";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { setConversationPlanMode } from "@app/lib/api/assistant/plan_mode";
import { gracefullyStopAgentLoop } from "@app/lib/api/assistant/pubsub";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import { getConversationPlanMode } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type PostPlanModeCancelResponseBody = {
  cancelled: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostPlanModeCancelResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const { cId } = req.query;
  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const planMode = getConversationPlanMode(conversation.metadata);
  if (!planMode) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Conversation is not in plan mode.",
      },
    });
  }

  const user = auth.user();
  if (!user || user.sId !== planMode.initiatedByUserId) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only the user who initiated plan mode can cancel it.",
      },
    });
  }

  // Resolve any pending exit_plan_mode approval so the UI card disappears and the agent cannot
  // re-enter the tool handler (which would see no plan-mode metadata and fail).
  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversation
    );
  for (const blocked of blockedActions) {
    if (blocked.metadata.toolName !== EXIT_PLAN_MODE_TOOL_NAME) {
      continue;
    }
    const action = await AgentMCPActionResource.fetchById(
      auth,
      blocked.actionId
    );
    if (!action) {
      continue;
    }
    await action.updateStatus(
      getMCPApprovalStateFromUserApprovalState("rejected")
    );
    await getRedisHybridManager().removeEvent((event) => {
      const payload = JSON.parse(event.message["payload"]);
      return isMCPApproveExecutionEvent(payload)
        ? payload.actionId === blocked.actionId
        : false;
    }, getMessageChannelId(blocked.messageId));
  }

  // If an agent loop is actively running in plan mode, signal a graceful stop so it exits
  // cleanly at the next step boundary.
  const runningMessageIds = await conversation.getRunningAgentMessageSIds(auth);
  if (runningMessageIds.length > 0) {
    await gracefullyStopAgentLoop(auth, {
      messageIds: runningMessageIds,
      conversationId: cId,
    });
  }

  await setConversationPlanMode(auth, cId, null);

  return res.status(200).json({ cancelled: true });
}

export default withSessionAuthenticationForWorkspace(handler);
