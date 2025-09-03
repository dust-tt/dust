import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ConversationWithoutContentType } from "@app/types";
import { assertNever } from "@app/types";

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

  // If the agent message is not in a created status, we want to mark the conversation as unread for all participants.
  switch (agentMessageRow.status) {
    case "created":
      // Do nothing.
      break;
    case "succeeded":
    case "failed":
    case "cancelled":
      // No excluded user because the message is created by the agent.
      await ConversationResource.markAsUnreadForOtherParticipants(auth, {
        conversation,
      });
      await publishConversationRelatedEvent({
        conversationId: conversation.sId,
        event: {
          type: "agent_message_done",
          created: Date.now(),
          configurationId: event.configurationId,
          messageId: event.messageId,
        },
      });
      break;
    default:
      assertNever(agentMessageRow.status);
  }

  await publishConversationRelatedEvent({
    conversationId: conversation.sId,
    event,
    step,
  });
}
