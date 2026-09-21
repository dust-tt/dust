import type { AuthenticatorType } from "@app/lib/auth";
import type { EnabledAgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

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

export async function applyConsumptionEventsActivity(
  authType: AuthenticatorType,
  { runKey }: ApplyConsumptionEventsArgs
): Promise<ApplyConsumptionEventsResult> {
  void authType;
  void runKey;

  return {
    eventModelIds: [],
    esPending: false,
    hasMore: false,
    finalizedExecution: null,
  };
}

export async function markConsumptionEventsProcessedActivity(
  authType: AuthenticatorType,
  { runKey, eventModelIds }: MarkConsumptionEventsProcessedArgs
): Promise<void> {
  void authType;
  void runKey;
  void eventModelIds;
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
