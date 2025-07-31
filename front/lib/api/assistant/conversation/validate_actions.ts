import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { isMCPApproveExecutionEvent } from "@app/lib/actions/mcp";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { publishEvent } from "@app/lib/api/assistant/pubsub";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import logger from "@app/logger/logger";

function getActionChannel(actionId: string): string {
  return `action-${actionId}`;
}

export async function validateAction({
  auth,
  conversationId,
  messageId,
  actionId,
  approved,
}: {
  auth: Authenticator;
  conversationId: string;
  messageId: string;
  actionId: string;
  approved: MCPValidationOutputType;
}): Promise<{ success: boolean }> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const actionChannel = getActionChannel(actionId);

  logger.info(
    {
      workspaceId,
      conversationId,
      messageId,
      actionId,
      approved,
    },
    "Tool validation request"
  );

  // Publish validation event to the action channel
  await publishEvent({
    origin: "action_validation",
    channel: actionChannel,
    event: JSON.stringify({
      type: approved,
      created: Date.now(),
      actionId,
      messageId,
      conversationId,
    }),
  });

  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isMCPApproveExecutionEvent(payload)
      ? payload.actionId === actionId
      : false;
  }, getMessageChannelId(messageId));

  // Use AgentStepContentResource to update action status
  const validationResult = await AgentStepContentResource.validateAction(auth, {
    messageId,
    actionId,
    approved,
  });

  if (!validationResult.success || !validationResult.action) {
    logger.error(
      {
        workspaceId,
        conversationId,
        messageId,
        actionId,
      },
      "Action not found for validation"
    );
    return { success: false };
  }

  const action = validationResult.action;
  const newStatus = approved === "approved" || approved === "always_approved" 
    ? "allowed_explicitly" 
    : "denied";

  logger.info(
    {
      workspaceId,
      conversationId,
      messageId,
      actionId,
      newStatus,
    },
    `Action ${approved === "approved" ? "approved" : "rejected"} by user`
  );

  // If approved, restart the workflow to resume execution with the approved tools
  if (approved === "approved") {
    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      logger.error(
        {
          workspaceId,
          conversationId,
          messageId,
          actionId,
          error: conversationRes.error,
        },
        "Failed to get conversation for workflow restart"
      );
      return { success: false };
    }

    const conversation = conversationRes.value;
    const agentMessage = action.agentMessage;

    if (!agentMessage) {
      logger.error(
        {
          workspaceId,
          conversationId,
          messageId,
          actionId,
        },
        "Agent message not found for workflow restart"
      );
      return { success: false };
    }

    // Launch a new workflow to resume execution with the approved tools
    const workflowResult = await launchAgentLoopWorkflow({
      authType: auth.toJSON(),
      runAsynchronousAgentArgs: {
        agentMessageId: agentMessage.message?.sId || messageId,
        agentMessageVersion: agentMessage.agentConfigurationVersion,
        conversationId: conversation.sId,
        conversationTitle: conversation.title,
        userMessageId: agentMessage.message?.sId || messageId, // Using same as agent message for now
        userMessageVersion: 0,
      },
      startStep: 0, // Default to step 0 for now
      resumeFromBlockedTools: true,
    });

    if (workflowResult.isErr()) {
      logger.error(
        {
          workspaceId,
          conversationId,
          messageId,
          actionId,
          error: workflowResult.error,
        },
        "Failed to restart workflow after action approval"
      );
      return { success: false };
    }

    logger.info(
      {
        workspaceId,
        conversationId,
        messageId,
        actionId,
      },
      "Successfully restarted workflow after action approval"
    );
  }

  return { success: true };
}
