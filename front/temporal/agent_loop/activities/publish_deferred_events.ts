import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import type { DeferredEvent } from "@app/temporal/agent_loop/lib/deferred_events";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WhereOptions } from "sequelize";

/**
 * Activity to publish events that were deferred during tool execution.
 * This ensures that certain events (like personal auth errors) are only sent after all tools in a
 * step have completed execution.
 *
 * @param deferredEvents Array of events to publish
 * @returns true if the workflow should pause (wait for external action), false if it can continue
 */
export async function publishDeferredEventsActivity(
  deferredEvents: DeferredEvent[]
): Promise<boolean> {
  let shouldPauseWorkflow = false;

  for (const [index, deferredEvent] of deferredEvents.entries()) {
    const { event, context } = deferredEvent;
    const isLastEvent = index === deferredEvents.length - 1;

    const where: WhereOptions<AgentMessageModel> = {
      id: context.agentMessageRowId,
    };

    // TODO(2025-12-19 FLAV): Remove this check once all ongoing workflows have terminated.
    if (context.workspaceId) {
      where.workspaceId = context.workspaceId;
    }

    const agentMessageRow = await AgentMessageModel.findOne({
      where,
    });
    if (!agentMessageRow) {
      throw new Error(
        `Agent message row not found: ${context.agentMessageRowId}`
      );
    }

    let eventToPublish: AgentMessageEvents;

    switch (event.type) {
      case "tool_personal_auth_required":
        eventToPublish = {
          ...event,
          isLastBlockingEventForStep: isLastEvent,
          metadata: {
            ...event.metadata,
            // Override the message id to root the event to the right channel.
            pubsubMessageId: deferredEvent.context.agentMessageId,
          },
        };
        break;

      case "tool_file_auth_required":
        // Publish the file auth required event.
        // Similar to tool_personal_auth_required but for file-specific authorization.
        eventToPublish = {
          ...event,
          isLastBlockingEventForStep: isLastEvent,
          metadata: {
            ...event.metadata,
            // Override the message id to root the event to the right channel.
            pubsubMessageId: deferredEvent.context.agentMessageId,
          },
        };
        break;

      case "tool_approve_execution":
        eventToPublish = {
          ...event,
          metadata: {
            ...event.metadata,
            // Override the message id to root the event to the right channel.
            pubsubMessageId: deferredEvent.context.agentMessageId,
          },
        };
        break;

      case "tool_ask_user_question":
        eventToPublish = {
          ...event,
          metadata: {
            ...event.metadata,
            // Override the message id to root the event to the right channel.
            pubsubMessageId: deferredEvent.context.agentMessageId,
          },
        };
        break;

      default:
        assertNever(event);
    }

    await publishConversationRelatedEvent({
      conversationId: context.conversationId,
      event: eventToPublish,
      step: context.step,
    });

    // Check if this event should pause the workflow.
    if (deferredEvent.shouldPauseAgentLoop) {
      shouldPauseWorkflow = true;
    }
  }

  return shouldPauseWorkflow;
}
