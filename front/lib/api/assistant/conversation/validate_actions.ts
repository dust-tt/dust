import assert from "assert";

import type { ActionApprovalStateType } from "@app/lib/actions/mcp";
import {
  getMCPApprovalStateFromUserApprovalState,
  isMCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import { setUserAlwaysApprovedTool } from "@app/lib/actions/utils";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { Message } from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import logger from "@app/logger/logger";
import type { ConversationType, Result } from "@app/types";
import { Err, Ok } from "@app/types";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";

async function getUserMessageIdFromMessageId(
  auth: Authenticator,
  { messageId }: { messageId: string }
): Promise<{
  agentMessageId: string;
  agentMessageVersion: number;
  userMessageId: string;
  userMessageVersion: number;
}> {
  // Query 1: Get the message and its parentId.
  const agentMessage = await Message.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: messageId,
    },
    attributes: ["parentId", "version", "sId"],
  });

  assert(
    agentMessage?.parentId,
    "Agent message is expected to have a parentId"
  );

  // Query 2: Get the parent message's sId (which is the user message).
  const parentMessage = await Message.findOne({
    where: {
      id: agentMessage.parentId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    attributes: ["sId", "version"],
  });

  assert(parentMessage, "A user message is expected for the agent message");

  return {
    agentMessageId: agentMessage.sId,
    agentMessageVersion: agentMessage.version,
    userMessageId: parentMessage.sId,
    userMessageVersion: parentMessage.version,
  };
}

export async function validateAction(
  auth: Authenticator,
  conversation: ConversationType,
  {
    actionId,
    approvalState,
    messageId,
  }: {
    actionId: string;
    approvalState: ActionApprovalStateType;
    messageId: string;
  }
): Promise<Result<void, DustError>> {
  const { sId: conversationId, title: conversationTitle } = conversation;

  logger.info(
    {
      actionId,
      messageId,
      approvalState,
      conversationId,
    },
    "Tool validation request"
  );

  const {
    agentMessageId,
    agentMessageVersion,
    userMessageId,
    userMessageVersion,
  } = await getUserMessageIdFromMessageId(auth, {
    messageId,
  });

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  const agentStepContent = await AgentStepContentResource.fetchByModelId(
    action.stepContentId
  );
  if (!agentStepContent) {
    return new Err(
      new DustError(
        "internal_error",
        `Agent step content not found: ${action.stepContentId}`
      )
    );
  }

  if (action.status !== "blocked_validation_required") {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked: ${action.status}`
      )
    );
  }

  const [updatedCount] = await action.updateStatus(
    getMCPApprovalStateFromUserApprovalState(approvalState)
  );

  if (approvalState === "always_approved") {
    const user = auth.user();
    if (user) {
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId: action.toolConfiguration.toolServerId,
        functionCallName: action.functionCallName,
      });
    }
  }

  if (updatedCount === 0) {
    logger.info(
      {
        actionId,
        messageId,
        approvalState,
      },
      "Action already approved or rejected"
    );

    return new Ok(undefined);
  }

  // Remove the tool approval request event from the message channel.
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isMCPApproveExecutionEvent(payload)
      ? payload.actionId === actionId
      : false;
  }, getMessageChannelId(messageId));

  await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      userMessageId,
      userMessageVersion,
    },
    // Resume from the step where the action was created.
    startStep: agentStepContent.step,
  });

  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId,
      messageId,
      actionId,
    },
    `Action ${approvalState === "approved" ? "approved" : "rejected"} by user`
  );

  return new Ok(undefined);
}
