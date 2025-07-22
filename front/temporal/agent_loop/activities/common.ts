import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { ConversationType } from "@app/types";

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
        await AgentStepContentResource.makeNew({
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
          version: 0,
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
  event: AgentMessageEvents,
  conversation: ConversationType,
  agentMessageRow: AgentMessage,
  step: number
): Promise<void> {
  // Process database operations BEFORE publishing to Redis.
  await processEventForDatabase(event, agentMessageRow, step);

  await publishConversationRelatedEvent(event, {
    conversationId: conversation.sId,
  });
}
