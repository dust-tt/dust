import { indexAgentMessageConsumptionSnapshot } from "@app/lib/analytics/agent_message_consumption";
import { applyConsumptionExecutionTotal } from "@app/lib/api/assistant/consumption/root_hash";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import assert from "assert";

const EVENT_BATCH_SIZE = 256;
const EVENTS_APPLIED_METRIC = "consumption.events_applied";
const ES_VERSION_CONFLICT_METRIC =
  "consumption.elasticsearch_version_conflict";

export type ApplyConsumptionEventsResult = {
  eventIds: number[];
  hasMore: boolean;
  finalizedStatus: AgentMessageStatus | null;
};

function finalizedStatusFromEvents(
  events: AgentMessageConsumptionEventResource[]
): AgentMessageStatus | null {
  const finalized = events.findLast(
    (event) => event.kind === "execution_finalized"
  );
  if (!finalized) {
    return null;
  }
  assert(finalized.status !== null, "Finalized event is missing its status");
  return finalized.status;
}

export async function applyConsumptionEventsActivity(
  authType: AuthenticatorType,
  { runKey }: { runKey: string }
): Promise<ApplyConsumptionEventsResult> {
  const auth = await Authenticator.fromJSON(authType);
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const events = await AgentMessageConsumptionEventResource.listUnprocessed(
    auth,
    { runKey, limit: EVENT_BATCH_SIZE }
  );

  const lastEvent = events.at(-1);
  if (lastEvent) {
    const rootAgentMessageIds = new Set(
      events.map((event) => event.rootAgentMessageId)
    );
    const agentMessageModelIds = new Set(
      events.map((event) => event.agentMessageId)
    );
    assert(
      rootAgentMessageIds.size === 1 && agentMessageModelIds.size === 1,
      "One execution cannot change message identity"
    );
    const totalCreditAmountMicro =
      await AgentMessageConsumptionItemResource.sumConsumptionCreditAmountMicroByRunKey(
        auth,
        { runKey }
      );
    await applyConsumptionExecutionTotal({
      workspaceId,
      runKey,
      rootAgentMessageId: lastEvent.rootAgentMessageId,
      totalCreditAmountMicro,
      subagentAgentMessageId:
        events.find((event) => event.kind === "execution_started")
          ?.subagentAgentMessageId ?? null,
    });
  }

  const latestProjectionEventByAgentMessageModelId = new Map<
    number,
    AgentMessageConsumptionEventResource
  >();
  for (const event of events) {
    if (event.kind !== "execution_started") {
      latestProjectionEventByAgentMessageModelId.set(
        event.agentMessageId,
        event
      );
    }
  }
  for (const event of latestProjectionEventByAgentMessageModelId.values()) {
    const eventModelId =
      await AgentMessageConsumptionEventResource.maxIdForAgentMessage(auth, {
        agentMessageModelId: event.agentMessageId,
      });
    const result = await indexAgentMessageConsumptionSnapshot(auth, {
      agentMessageModelId: event.agentMessageId,
      eventModelId,
    });
    if (result.isErr()) {
      throw result.error;
    }
    if (result.value.versionConflictCount > 0) {
      statsDMetrics.increment(
        ES_VERSION_CONFLICT_METRIC,
        result.value.versionConflictCount
      );
    }
  }
  const eventIds = events.map((event) => event.id);
  if (eventIds.length > 0) {
    logger.info(
      {
        workspaceId,
        runKey,
        eventCount: events.length,
      },
      "[Consumption] Applied durable consumption events."
    );
  }

  return {
    eventIds,
    hasMore: events.length === EVENT_BATCH_SIZE,
    finalizedStatus: finalizedStatusFromEvents(events),
  };
}

export async function markConsumptionEventsProcessedActivity(
  authType: AuthenticatorType,
  { runKey, eventIds }: { runKey: string; eventIds: number[] }
): Promise<void> {
  if (eventIds.length === 0) {
    return;
  }
  const auth = await Authenticator.fromJSON(authType);
  const processedCount =
    await AgentMessageConsumptionEventResource.markProcessed(auth, {
      runKey,
      eventIds,
      processedAt: new Date(),
    });
  if (processedCount > 0) {
    statsDMetrics.increment(EVENTS_APPLIED_METRIC, processedCount);
    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        runKey,
        eventCount: processedCount,
      },
      "[Consumption] Marked durable consumption events as processed."
    );
  }
}
