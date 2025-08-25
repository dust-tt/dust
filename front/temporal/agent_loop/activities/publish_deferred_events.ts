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
          error: {
            code: "mcp_server_personal_authentication_required",
            message: event.authError.message,
            metadata: {
              mcp_server_id: event.authError.mcpServerId,
              provider: event.authError.provider,
              ...(event.authError.scope && {
                scope: event.authError.scope,
              }),
            },
          },
          isLastBlockingEventForStep: isLastEvent,
        };
        break;

      default:
        assertNever(event.type);
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
