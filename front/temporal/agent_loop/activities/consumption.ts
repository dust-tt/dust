import { getAgentMessageConsumptionMode } from "@app/lib/api/assistant/consumption/mode_switch";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/credit_consumption/client";
import type { EnabledAgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

type ExecutionEntryContext = {
  agentMessageModelId: ModelId;
  rootAgentMessageId: ModelId;
  runKey: string;
  status: AgentMessageStatus;
};

async function resolveExecutionEntryContext(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<ExecutionEntryContext | null> {
  const { agentMessageId, rootAgentMessageId, runKey } = agentLoopArgs;
  if (!runKey || !rootAgentMessageId) {
    return null;
  }
  const creditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    });
  if (!creditContext) {
    return null;
  }
  const rootCreditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId: rootAgentMessageId,
    });
  if (!rootCreditContext) {
    return null;
  }

  return {
    agentMessageModelId: creditContext.agentMessageModelId,
    rootAgentMessageId: rootCreditContext.agentMessageModelId,
    runKey,
    status: creditContext.status,
  };
}

async function fetchExecutionStartedMode(
  auth: Authenticator,
  context: ExecutionEntryContext
): Promise<EnabledAgentMessageConsumptionMode | null> {
  const executionStarted =
    await AgentMessageConsumptionEventResource.fetchLatestExecutionStartedForAgentMessage(
      auth,
      { agentMessageModelId: context.agentMessageModelId }
    );
  if (executionStarted) {
    return executionStarted.consumptionMode;
  }
  if (context.agentMessageModelId === context.rootAgentMessageId) {
    return null;
  }
  const rootExecutionStarted =
    await AgentMessageConsumptionEventResource.fetchLatestExecutionStartedForAgentMessage(
      auth,
      { agentMessageModelId: context.rootAgentMessageId }
    );
  return rootExecutionStarted?.consumptionMode ?? null;
}

/**
 * @cc [owner:id13,label:backend;product] consumption-mode-event-snapshot
 * An existing execution-started event MUST determine the mode. Without one, only an initial
 * execution may evaluate feature flags; resumed executions MUST remain on legacy billing.
 */
export async function recordExecutionStarted(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  { startStep }: { startStep: number }
): Promise<boolean> {
  const { runKey } = agentLoopArgs;
  if (!runKey) {
    return false;
  }
  const context = await resolveExecutionEntryContext(auth, agentLoopArgs);
  if (!context) {
    return false;
  }
  const existingMode = await fetchExecutionStartedMode(auth, context);
  const mode =
    existingMode ??
    (startStep === 0 ? await getAgentMessageConsumptionMode(auth) : "off");
  if (mode === "off") {
    return false;
  }

  await withTransaction(async (transaction) => {
    await AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "execution_started",
        idempotencyKey: `execution:${runKey}:started`,
        runKey: context.runKey,
        rootAgentMessageId: context.rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        consumptionMode: mode,
      },
      transaction,
    });
  });

  const signalRes = await signalConsumptionEventsAppended(auth.toJSON(), {
    runKey: context.runKey,
  });
  if (signalRes.isErr()) {
    throw signalRes.error;
  }
  return true;
}

export async function recordExecutionFinalized(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<EnabledAgentMessageConsumptionMode | null> {
  const context = await resolveExecutionEntryContext(auth, agentLoopArgs);
  if (!context) {
    return null;
  }
  const consumptionMode = await fetchExecutionStartedMode(auth, context);
  if (consumptionMode === null) {
    return null;
  }
  await withTransaction(async (transaction) => {
    await AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "execution_finalized",
        idempotencyKey: `execution:${context.runKey}:finalized`,
        runKey: context.runKey,
        rootAgentMessageId: context.rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        status: context.status,
        consumptionMode,
      },
      transaction,
    });
  });

  const signalRes = await signalConsumptionEventsAppended(auth.toJSON(), {
    runKey: context.runKey,
  });
  if (signalRes.isErr()) {
    throw signalRes.error;
  }

  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey: context.runKey,
      messageStatus: context.status,
    },
    "[Consumption] Closed an execution."
  );
  return consumptionMode;
}
