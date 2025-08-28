import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import type { DeferredEvent } from "@app/temporal/agent_loop/lib/deferred_events";
import { assertNever } from "@app/types";

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

    const agentMessageRow = await AgentMessage.findByPk(
      context.agentMessageRowId
    );
    if (!agentMessageRow) {
      throw new Error(
        `Agent message row not found: ${context.agentMessageRowId}`
      );
    }

    let eventToPublish: AgentMessageEvents;

    switch (event.type) {
      case "tool_personal_auth_required":
        eventToPublish = {
          type: "tool_error",
          created: event.created,
          configurationId: event.configurationId,
          messageId: event.messageId,
          conversationId: event.conversationId,
          error: {
            code: "mcp_server_personal_authentication_required",
            message: event.authError.message,
            metadata: {
              mcp_server_id: event.authError.mcpServerId,
              provider: event.authError.provider,
              ...(event.authError.scope && {
                scope: event.authError.scope,
              }),
              // TODO(DURABLE-AGENTS 2025-08-25): Find a proper place to pass conversationId.
              conversationId: event.conversationId,
              messageId: event.messageId,
            },
          },
          metadata: {
            pubsubMessageId: deferredEvent.context.agentMessageId,
          },
          isLastBlockingEventForStep: isLastEvent,
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
