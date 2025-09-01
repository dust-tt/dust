import type { ActionApprovalStateType } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import assert from "assert";

import {
  getMCPApprovalStateFromUserApprovalState,
  isMCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import { setUserAlwaysApprovedTool } from "@app/lib/actions/utils";
import { runAgentLoop } from "@app/lib/api/assistant/agent";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { Message } from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import logger from "@app/logger/logger";
import { buildActionBaseParams } from "@app/temporal/agent_loop/lib/action_utils";
import type { ConversationType, Result } from "@app/types";
import { getRunAgentData } from "@app/types/assistant/agent_run";

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
): Promise<Result<void, Error>> {
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
    return new Err(new Error(`Action not found: ${actionId}`));
  }

  const agentStepContent = await AgentStepContentResource.fetchByModelId(
    action.stepContentId
  );
  if (!agentStepContent) {
    return new Err(
      new Error(`Agent step content not found: ${action.stepContentId}`)
    );
  }

  if (action.status !== "blocked_validation_required") {
    return new Err(new Error(`Action is not blocked: ${action.status}`));
  }

  const [updatedCount] = await action.updateStatus(
    getMCPApprovalStateFromUserApprovalState(approvalState)
  );

  if (approvalState === "always_approved") {
    const user = auth.user();
    if (user) {
      const toolServerId = action.toolConfiguration?.toolServerId;
      const actionBaseParams = await buildActionBaseParams({
        agentMessageId: action.agentMessageId,
        citationsAllocated: action.citationsAllocated,
        mcpServerConfigurationId: action.mcpServerConfigurationId,
        mcpServerId: action.toolConfiguration.toolServerId,
        step: agentStepContent.step,
        stepContentId: action.stepContentId,
        status: action.status,
      });
      const toolName = actionBaseParams.functionCallName;

      if (toolName) {
        await setUserAlwaysApprovedTool({
          user,
          mcpServerId: toolServerId,
          toolName,
        });
      }
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

  const runAgentDataRes = await getRunAgentData(auth.toJSON(), {
    sync: false,
    idArgs: {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      userMessageId,
      userMessageVersion,
    },
  });

  if (runAgentDataRes.isErr()) {
    logger.error(
      {
        error: runAgentDataRes.error,
      },
      "Error getting run agent data"
    );
    return runAgentDataRes;
  }

  await runAgentLoop(
    auth,
    {
      sync: true,
      inMemoryData: runAgentDataRes.value,
    },
    {
      // Resume from the step where the action was created.
      startStep: agentStepContent.step,
    }
  );

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
