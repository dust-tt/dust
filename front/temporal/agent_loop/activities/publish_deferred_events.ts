import { getConversationLockById } from "@app/lib/api/assistant/conversation/lock";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { DeferredEvent } from "@app/temporal/agent_loop/lib/deferred_events";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { Op } from "sequelize";

async function fetchBlockedActionIds(
  deferredEvents: DeferredEvent[],
  transaction: Parameters<
    typeof AgentMCPActionResource.fetchBlockedActionIds
  >[0]["transaction"]
): Promise<Set<string>> {
  if (deferredEvents.length === 0) {
    return new Set();
  }

  const workspaceModelId = deferredEvents[0].context.workspaceId;
  if (
    deferredEvents.some(
      ({ context }) => context.workspaceId !== workspaceModelId
    )
  ) {
    throw new Error("Deferred events must belong to the same workspace.");
  }

  return AgentMCPActionResource.fetchBlockedActionIds({
    actionIds: [
      ...new Set(
        deferredEvents.flatMap(({ context, event }) => [
          event.actionId,
          // TODO(2026-08-28): Remove the fallback after pre-deploy workflows have drained.
          context.originActionId ?? event.actionId,
        ])
      ),
    ],
    workspaceModelId,
    transaction,
  });
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
  if (deferredEvents.length === 0) {
    return false;
  }

  const { conversationId, workspaceId } = deferredEvents[0].context;
  if (
    deferredEvents.some(
      ({ context }) =>
        context.conversationId !== conversationId ||
        context.workspaceId !== workspaceId
    )
  ) {
    throw new Error(
      "Deferred events must belong to the same conversation and workspace."
    );
  }
  const conversationModelId = getResourceIdFromSId(conversationId);
  if (!conversationModelId) {
    throw new Error(`Invalid conversation ID: ${conversationId}`);
  }

  // Termination, sandbox-parent completion, and action resolution take this same lock. Publishing
  // inside it gives clients a stable ordering: a prompt is either skipped after the state change,
  // or appears before the later resolution/terminal event.
  return withTransaction(async (transaction) => {
    await getConversationLockById(conversationModelId, transaction);

    const messageRows = await AgentMessageModel.findAll({
      attributes: ["id"],
      where: {
        id: {
          [Op.in]: [
            ...new Set(
              deferredEvents.map(({ context }) => context.agentMessageRowId)
            ),
          ],
        },
        workspaceId,
        status: "created",
      },
      transaction,
    });
    const resumableMessageIds = new Set(messageRows.map(({ id }) => id));
    const blockedActionIds = await fetchBlockedActionIds(
      deferredEvents,
      transaction
    );
    const activeDeferredEvents = deferredEvents.filter(
      ({ context, event }) =>
        resumableMessageIds.has(context.agentMessageRowId) &&
        blockedActionIds.has(event.actionId) &&
        blockedActionIds.has(context.originActionId ?? event.actionId)
    );

    for (const [index, deferredEvent] of activeDeferredEvents.entries()) {
      const { event, context } = deferredEvent;
      const isLastEvent = index === activeDeferredEvents.length - 1;
      let eventToPublish: AgentMessageEvents;

      switch (event.type) {
        case "tool_personal_auth_required":
          eventToPublish = {
            ...event,
            isLastBlockingEventForStep: isLastEvent,
            metadata: {
              ...event.metadata,
              // Override the message id to root the event to the right channel.
              pubsubMessageId: context.agentMessageId,
            },
          };
          break;

        case "tool_file_auth_required":
          eventToPublish = {
            ...event,
            isLastBlockingEventForStep: isLastEvent,
            metadata: {
              ...event.metadata,
              // Override the message id to root the event to the right channel.
              pubsubMessageId: context.agentMessageId,
            },
          };
          break;

        case "tool_approve_execution":
          eventToPublish = {
            ...event,
            metadata: {
              ...event.metadata,
              // Override the message id to root the event to the right channel.
              pubsubMessageId: context.agentMessageId,
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
              pubsubMessageId: context.agentMessageId,
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
    }

    return activeDeferredEvents.some(
      ({ shouldPauseAgentLoop }) => shouldPauseAgentLoop
    );
  });
}
