import { indexAgentMessageConsumptionSnapshot } from "@app/lib/analytics/agent_message_consumption";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { EnabledAgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";

const EVENT_BATCH_SIZE = 256;
const EVENTS_APPLIED_METRIC = "consumption.events_applied";
const ES_VERSION_CONFLICT_METRIC = "consumption.elasticsearch_version_conflict";

export type FinalizedConsumptionExecution = {
  agentMessageModelId: ModelId;
  consumptionMode: EnabledAgentMessageConsumptionMode;
  rootAgentMessageId: ModelId;
  status: AgentMessageStatus;
  timestamp: string;
};

/**
 * @cc [owner:id13,label:backend] consumption-activity-result
 * Applying consumption events MUST return every value required to acknowledge the batch, retry its
 * Elasticsearch projection, continue pagination, and settle a finalized execution.
 */
export type ApplyConsumptionEventsResult = {
  eventModelIds: ModelId[];
  esPending: boolean;
  hasMore: boolean;
  finalizedExecution: FinalizedConsumptionExecution | null;
};

export type ReportConsumptionActivityFailureArgs = {
  errorMessage: string;
  operation: string;
  runKey: string;
};

export type ApplyConsumptionEventsArgs = {
  runKey: string;
};

export type MarkConsumptionEventsProcessedArgs = {
  runKey: string;
  eventModelIds: ModelId[];
};

export type CleanupConsumptionEventsResult = {
  deletedCount: number;
  hasMore: boolean;
};

export type RecoverPendingConsumptionWorkflowsResult = {
  hasMore: boolean;
  signalledCount: number;
};

export type BillExecutionArgs = FinalizedConsumptionExecution & {
  runKey: string;
};

export async function reportConsumptionActivityFailureActivity(
  authType: AuthenticatorType,
  { errorMessage, operation, runKey }: ReportConsumptionActivityFailureArgs
): Promise<void> {
  void authType;
  void errorMessage;
  void operation;
  void runKey;
}

function finalizedExecutionFromEvents(
  events: AgentMessageConsumptionEventResource[]
): FinalizedConsumptionExecution | null {
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
  { runKey }: ApplyConsumptionEventsArgs
): Promise<ApplyConsumptionEventsResult> {
  const auth = await Authenticator.fromJSON(authType);
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const events = await AgentMessageConsumptionEventResource.listUnprocessed(
    auth,
    { runKey, limit: EVENT_BATCH_SIZE }
  );

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
  const eventModelIds = events.map((event) => event.id);
  if (eventModelIds.length > 0) {
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
    eventModelIds,
    esPending: false,
    hasMore: events.length === EVENT_BATCH_SIZE,
    finalizedExecution: finalizedExecutionFromEvents(events),
  };
}

export async function markConsumptionEventsProcessedActivity(
  authType: AuthenticatorType,
  { runKey, eventModelIds }: MarkConsumptionEventsProcessedArgs
): Promise<void> {
  if (eventModelIds.length === 0) {
    return;
  }
  const auth = await Authenticator.fromJSON(authType);
  const processedCount =
    await AgentMessageConsumptionEventResource.markProcessed(auth, {
      runKey,
      eventModelIds,
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

export async function cleanupConsumptionEventsActivity(): Promise<CleanupConsumptionEventsResult> {
  return { deletedCount: 0, hasMore: false };
}

export async function recoverPendingConsumptionWorkflowsActivity(): Promise<RecoverPendingConsumptionWorkflowsResult> {
  return { hasMore: false, signalledCount: 0 };
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
  }: BillExecutionArgs
): Promise<void> {
  void authType;
  void agentMessageModelId;
  void consumptionMode;
  void rootAgentMessageId;
  void runKey;
  void status;
  void timestamp;
}
