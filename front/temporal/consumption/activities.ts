import { indexAgentMessageConsumptionSnapshot } from "@app/lib/analytics/agent_message_consumption";
import { billExecution } from "@app/lib/api/assistant/consumption/bill";
import { recordExecutionCreditCounters } from "@app/lib/api/assistant/consumption/counters";
import {
  applyConsumptionExecutionTotal,
  readConsumptionExecutionTotal,
} from "@app/lib/api/assistant/consumption/root_hash";
import { emitAgentMessageUsageEvent } from "@app/lib/api/assistant/consumption/usage_event";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/consumption/client";
import type { EnabledAgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";

const EVENT_BATCH_SIZE = 256;
const EVENTS_APPLIED_METRIC = "consumption.events_applied";
const OUTBOX_PENDING_AGE_MS_METRIC = "consumption.outbox_pending_age_ms";
const OUTBOX_RECOVERY_SIGNALLED_METRIC =
  "consumption.outbox_recovery_signalled";
const OUTBOX_RECOVERY_SCAN_SATURATED_METRIC =
  "consumption.outbox_recovery_scan_saturated";
const ES_VERSION_CONFLICT_METRIC = "consumption.elasticsearch_version_conflict";
const CONSUMPTION_ROOT_HASH_DRIFT_METRIC =
  "consumption.root_hash_drift_micro_credits";
const OUTBOX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const OUTBOX_CLEANUP_BATCH_SIZE = 10_000;
const MAX_OUTBOX_CLEANUP_BATCHES = 10;
const OUTBOX_RECOVERY_SCAN_SIZE = 1_000;
const OUTBOX_RECOVERY_CONCURRENCY = 10;

export type ApplyConsumptionEventsResult = {
  eventIds: number[];
  esPending: boolean;
  hasMore: boolean;
  finalizedExecution: {
    agentMessageModelId: ModelId;
    consumptionMode: EnabledAgentMessageConsumptionMode;
    rootAgentMessageId: string;
    status: AgentMessageStatus;
    timestamp: string;
  } | null;
};

function finalizedExecutionFromEvents(
  events: AgentMessageConsumptionEventResource[]
): ApplyConsumptionEventsResult["finalizedExecution"] {
  const finalized = events.findLast(
    (event) => event.kind === "execution_finalized"
  );
  if (!finalized) {
    return null;
  }
  assert(finalized.status !== null, "Finalized event is missing its status");
  assert(
    finalized.consumptionMode !== null,
    "Finalized event is missing its consumption mode"
  );
  return {
    agentMessageModelId: finalized.agentMessageId,
    consumptionMode: finalized.consumptionMode,
    rootAgentMessageId: finalized.rootAgentMessageId,
    status: finalized.status,
    timestamp: finalized.createdAt.toISOString(),
  };
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

  const firstEvent = events.at(0);
  const lastEvent = events.at(-1);
  if (firstEvent && lastEvent) {
    statsDMetrics.distribution(
      OUTBOX_PENDING_AGE_MS_METRIC,
      Date.now() - firstEvent.createdAt.getTime()
    );
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
    ModelId,
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
  let esPending = false;
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
      esPending = true;
      logger.error(
        { err: result.error, runKey, workspaceId },
        "[Consumption] Failed to refresh Elasticsearch documents."
      );
      break;
    }
    if (result.value.versionConflictCount > 0) {
      statsDMetrics.increment(
        ES_VERSION_CONFLICT_METRIC,
        result.value.versionConflictCount
      );
    }
  }
  const eventIds = esPending ? [] : events.map((event) => event.id);
  if (eventIds.length > 0) {
    logger.info(
      {
        workspaceId,
        runKey,
        eventCount: events.length,
      },
      "[Consumption] Applied outbox events."
    );
  }

  return {
    eventIds,
    esPending,
    hasMore: !esPending && events.length === EVENT_BATCH_SIZE,
    finalizedExecution: finalizedExecutionFromEvents(events),
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
      "[Consumption] Marked outbox events as processed."
    );
  }
}

export async function cleanupConsumptionEventsActivity(): Promise<{
  deletedCount: number;
  hasMore: boolean;
}> {
  const cutoff = new Date(Date.now() - OUTBOX_RETENTION_MS);
  let deletedCount = 0;
  let lastBatchDeletedCount = 0;
  for (let batch = 0; batch < MAX_OUTBOX_CLEANUP_BATCHES; batch++) {
    lastBatchDeletedCount =
      await AgentMessageConsumptionEventResource.deleteOlderThan({
        cutoff,
        limit: OUTBOX_CLEANUP_BATCH_SIZE,
      });
    deletedCount += lastBatchDeletedCount;
    if (lastBatchDeletedCount < OUTBOX_CLEANUP_BATCH_SIZE) {
      break;
    }
  }
  logger.info(
    { cutoff, deletedCount },
    "[Consumption] Cleaned up expired outbox events."
  );
  return {
    deletedCount,
    hasMore: lastBatchDeletedCount === OUTBOX_CLEANUP_BATCH_SIZE,
  };
}

export async function recoverPendingConsumptionWorkflowsActivity(): Promise<{
  hasMore: boolean;
  signalledCount: number;
}> {
  const { executions, hasMore } =
    await AgentMessageConsumptionEventResource.listOldestUnprocessedExecutions({
      limit: OUTBOX_RECOVERY_SCAN_SIZE,
    });
  const workspaceModelIds = [
    ...new Set(executions.map(({ workspaceModelId }) => workspaceModelId)),
  ];
  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceModelIds);
  const authTypeByWorkspaceModelId = new Map(
    workspaces.map((workspace) => [
      workspace.id,
      {
        authMethod: "internal",
        groupIds: [],
        isByok: false,
        role: "admin",
        subscriptionId: null,
        userId: null,
        workspaceId: workspace.sId,
      } satisfies AuthenticatorType,
    ])
  );

  const signalled = await concurrentExecutor(
    executions,
    async ({ runKey, workspaceModelId }) => {
      const authType = authTypeByWorkspaceModelId.get(workspaceModelId);
      if (!authType) {
        logger.warn(
          { runKey, workspaceModelId },
          "[Consumption] Pending event references a missing workspace."
        );
        return false;
      }
      const result = await signalConsumptionEventsAppended(authType, {
        runKey,
      });
      if (result.isErr()) {
        throw result.error;
      }
      return true;
    },
    { concurrency: OUTBOX_RECOVERY_CONCURRENCY }
  );

  const signalledCount = signalled.filter(Boolean).length;
  if (signalledCount > 0) {
    statsDMetrics.increment(OUTBOX_RECOVERY_SIGNALLED_METRIC, signalledCount);
  }
  if (hasMore) {
    statsDMetrics.increment(OUTBOX_RECOVERY_SCAN_SATURATED_METRIC);
  }
  if (executions.length > 0) {
    logger.info(
      { hasMore, signalledCount },
      "[Consumption] Recovered pending consumption workflows."
    );
  }
  return { hasMore, signalledCount };
}

export async function billExecutionActivity(
  authType: AuthenticatorType,
  {
    agentMessageModelId,
    consumptionMode,
    rootAgentMessageId,
    runKey,
    status,
    timestamp,
  }: {
    agentMessageModelId: ModelId;
    consumptionMode: EnabledAgentMessageConsumptionMode;
    rootAgentMessageId: string;
    runKey: string;
    status: AgentMessageStatus;
    timestamp: string;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const context =
    await ConversationResource.fetchAgentMessageConsumptionAnalyticsContext(
      auth,
      { agentMessageModelId }
    );
  assert(context, "Finalized consumption event references a missing message");
  const agentMessageId = context.agentMessage.agentMessageId;
  const bill = await billExecution(auth, {
    agentMessageId,
    rootAgentMessageId,
    runKey,
  });
  if (!bill) {
    return;
  }

  if (consumptionMode === "live") {
    await ConversationResource.updateAgentMessageCostCreditsAtLeast(auth, {
      agentMessageModelId,
      costCredits: bill.costCredits,
    });
    await recordExecutionCreditCounters(auth, {
      agentMessageModelId,
      creditAmount: bill.eventCreditAmount,
      runKey,
      userMessageOrigin: bill.userMessageOrigin,
    });
    await emitAgentMessageUsageEvent(auth, {
      agentMessageId,
      bill,
      rootAgentMessageId,
      runKey,
      status,
      timestamp,
    });
  }
  await reportRootHashDrift(auth, {
    agentMessageId,
    billedCreditAmountMicro: bill.eventCreditAmount * MICRO_CREDITS_PER_CREDIT,
    rootAgentMessageId,
    runKey,
  });
}

async function reportRootHashDrift(
  auth: Authenticator,
  {
    agentMessageId,
    billedCreditAmountMicro,
    rootAgentMessageId,
    runKey,
  }: {
    agentMessageId: string;
    billedCreditAmountMicro: number;
    rootAgentMessageId: string;
    runKey: string;
  }
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const hashCreditAmountMicro = await readConsumptionExecutionTotal({
    workspaceId,
    rootAgentMessageId,
    runKey,
  });
  if (hashCreditAmountMicro === null) {
    return;
  }

  const driftCreditAmountMicro = Math.abs(
    hashCreditAmountMicro - billedCreditAmountMicro
  );
  statsDMetrics.gauge(
    CONSUMPTION_ROOT_HASH_DRIFT_METRIC,
    driftCreditAmountMicro
  );
  if (driftCreditAmountMicro > 0) {
    logger.warn(
      {
        workspaceId,
        agentMessageId,
        runKey,
        hashCreditAmountMicro,
        billedCreditAmountMicro,
      },
      "[Consumption] Root hash disagrees with the billed execution."
    );
  }
}
