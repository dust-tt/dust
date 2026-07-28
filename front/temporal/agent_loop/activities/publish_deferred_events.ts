import { isBlockedActionEvent } from "@app/lib/actions/mcp";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { DeferredEvent } from "@app/temporal/agent_loop/lib/deferred_events";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WhereOptions } from "sequelize";

async function isDeferredActionBlocked(
  deferredEvent: DeferredEvent
): Promise<boolean> {
  return AgentMCPActionResource.isBlockedForWorkspace({
    actionId: deferredEvent.event.actionId,
    workspaceModelId: deferredEvent.context.workspaceId,
  });
}

async function removeDeferredEvent(
  deferredEvent: DeferredEvent
): Promise<void> {
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return (
      isBlockedActionEvent(payload) &&
      payload.actionId === deferredEvent.event.actionId
    );
  }, getMessageChannelId(deferredEvent.context.agentMessageId));
}

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
  const activeDeferredEvents: DeferredEvent[] = [];

  for (const deferredEvent of deferredEvents) {
    if (await isDeferredActionBlocked(deferredEvent)) {
      activeDeferredEvents.push(deferredEvent);
    }
  }

  for (const [index, deferredEvent] of activeDeferredEvents.entries()) {
    const { event, context } = deferredEvent;
    const isLastEvent = index === activeDeferredEvents.length - 1;

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

    if (!(await isDeferredActionBlocked(deferredEvent))) {
      continue;
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
          isLastBlockingEventForStep: isLastEvent,
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

    if (!(await isDeferredActionBlocked(deferredEvent))) {
      // The action can be denied by message termination or parent completion between the first
      // status check and publication. Remove the just-published prompt; if denial happens after
      // this check, the denial path performs the same idempotent cleanup.
      await removeDeferredEvent(deferredEvent);
      continue;
    }

    // Check if this event should pause the workflow.
    if (deferredEvent.shouldPauseAgentLoop) {
      shouldPauseWorkflow = true;
    }
  }

  return shouldPauseWorkflow;
}
