import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { fetchMessageInConversation } from "@app/lib/api/assistant/messages";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { Authenticator as AuthenticatorClass } from "@app/lib/auth";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types";
import {
  getRunAgentData,
  RunAgentAsynchronousArgs,
} from "@app/types/assistant/agent_run";
import _ from "lodash";

// Process database operations for agent events before publishing to Redis.
async function processEventForDatabase(
  event: AgentMessageEvents,
  agentMessageRow: AgentMessage,
  step: number
): Promise<void> {
  switch (event.type) {
    case "agent_error":
    case "tool_error":
      // Store error in database.
      await agentMessageRow.update({
        status: "failed",
        errorCode: event.error.code,
        errorMessage: event.error.message,
        errorMetadata: event.error.metadata,
      });

      if (event.type === "agent_error") {
        await AgentStepContentResource.createNewVersion({
          workspaceId: agentMessageRow.workspaceId,
          agentMessageId: agentMessageRow.id,
          step,
          index: 0, // Errors are the only content for this step
          type: "error",
          value: {
            type: "error",
            value: {
              code: event.error.code,
              message: event.error.message,
              metadata: {
                ...event.error.metadata,
                category: event.error.metadata?.category || "",
              },
            },
          },
        });
      }
      break;

    case "agent_generation_cancelled":
      // Store cancellation in database.
      await agentMessageRow.update({
        status: "cancelled",
      });
      break;

    case "agent_message_success":
      // Store success and run IDs in database.
      await agentMessageRow.update({
        runIds: event.runIds,
        status: "succeeded",
      });

      break;

    default:
      // Ensure we handle all event types.
      break;
  }
}

async function processEventForUnreadState(
  auth: Authenticator,
  {
    event,
    conversation,
  }: { event: AgentMessageEvents; conversation: ConversationWithoutContentType }
) {
  const agentMessageDoneEventTypes: AgentMessageEvents["type"][] = [
    "agent_message_success",
    "agent_generation_cancelled",
    "agent_error",
    "tool_error",
  ];
  // If the event is a done event, we want to mark the conversation as unread for all participants.
  if (agentMessageDoneEventTypes.includes(event.type)) {
    // No excluded user because the message is created by the agent.
    await ConversationResource.markAsUnreadForOtherParticipants(auth, {
      conversation,
    });

    // Publish the agent message done event that will be handled on the client-side.
    await publishConversationRelatedEvent({
      conversationId: conversation.sId,
      event: {
        type: "agent_message_done",
        created: Date.now(),
        configurationId: event.configurationId,
        conversationId: conversation.sId,
        messageId: event.messageId,
      },
    });
  }
}

export async function updateResourceAndPublishEvent(
  auth: Authenticator,
  {
    event,
    agentMessageRow,
    conversation,
    step,
  }: {
    event: AgentMessageEvents;
    agentMessageRow: AgentMessage;
    conversation: ConversationWithoutContentType;
    step: number;
  }
): Promise<void> {
  // Process database operations BEFORE publishing to Redis.
  await processEventForDatabase(event, agentMessageRow, step);

  await processEventForUnreadState(auth, { event, conversation });

  await publishConversationRelatedEvent({
    conversationId: conversation.sId,
    event,
    step,
  });
}

export async function notifyWorkflowError(
  authType: AuthenticatorType,
  {
    conversationId,
    agentMessageId,
    agentMessageVersion,
    error,
  }: {
    conversationId: string;
    agentMessageId: string;
    agentMessageVersion: number;
    error: Error;
  }
): Promise<void> {
  const auth = await AuthenticatorClass.fromJSON(authType);

  // Use lighter fetchConversationWithoutContent
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }
  const conversation = conversationRes.value;

  // Fetch the agent message using the proper API function
  const messageRow = await fetchMessageInConversation(
    auth,
    conversation,
    agentMessageId
  );

  if (!messageRow?.agentMessage) {
    throw new Error(`Agent message not found: ${agentMessageId}`);
  }

  const errorEvent: AgentMessageEvents = {
    type: "agent_error",
    created: Date.now(),
    configurationId: messageRow.agentMessage.agentConfigurationId || "",
    messageId: agentMessageId,
    error: {
      code: "workflow_error",
      message: error.message || "Workflow execution failed",
      metadata: {
        category: "critical_failure",
        // Ensure errorName is a string (not an Error object or undefined)
        errorName: error.name || "UnknownError",
      },
    },
  };

  await updateResourceAndPublishEvent(auth, {
    event: errorEvent,
    agentMessageRow: messageRow.agentMessage,
    conversation,
    step: 0, // Workflow-level error, not tied to a specific step
  });
}

/**
 * Activity executed after a cancel signal
 */
export async function finalizeCancellationActivity(
  authType: AuthenticatorType,
  runAgentArgs: RunAgentAsynchronousArgs
): Promise<void> {
  const runAgentDataRes = await getRunAgentData(authType, {
    sync: false,
    idArgs: runAgentArgs,
  });
  if (runAgentDataRes.isErr()) {
    throw new Error(
      `Failed to get run agent data: ${runAgentDataRes.error.message}`
    );
  }
  const {
    auth,
    agentConfiguration,
    agentMessage,
    conversation,
    agentMessageRow,
  } = runAgentDataRes.value;

  // get the last step of the agent message
  const step = _.maxBy(agentMessage.contents, "step")?.step || 0;

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration({ agentConfiguration })
  );

  // Helper function to flush all pending tokens from the content parser
  async function flushParserTokens(): Promise<void> {
    for await (const tokenEvent of contentParser.flushTokens()) {
      await updateResourceAndPublishEvent(auth, {
        event: tokenEvent,
        agentMessageRow,
        conversation,
        step,
      });
    }
  }

  await flushParserTokens();
  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "agent_generation_cancelled",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
    },
    agentMessageRow,
    conversation,
    step,
  });
  logger.error(
    {
      agentMessageId: agentMessage.sId,
      conversationId: conversation.sId,
    },
    "Agent generation cancelled"
  );
}
