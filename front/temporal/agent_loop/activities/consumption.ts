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
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type ExecutionEntryContext = {
  agentMessageModelId: ModelId;
  rootAgentMessageModelId: ModelId;
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
    agentMessageId === rootAgentMessageId
      ? creditContext
      : await ConversationResource.fetchAgentMessageCreditContext(auth, {
          agentMessageId: rootAgentMessageId,
        });
  if (!rootCreditContext) {
    return null;
  }

  return {
    agentMessageModelId: creditContext.agentMessageModelId,
    rootAgentMessageModelId: rootCreditContext.agentMessageModelId,
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
  if (context.agentMessageModelId === context.rootAgentMessageModelId) {
    return null;
  }
  const rootExecutionStarted =
    await AgentMessageConsumptionEventResource.fetchLatestExecutionStartedForAgentMessage(
      auth,
      { agentMessageModelId: context.rootAgentMessageModelId }
    );
  return rootExecutionStarted?.consumptionMode ?? null;
}

/**
 * @cc [owner:id13,label:backend;product] consumption-mode-event-snapshot
 * An existing execution-started event MUST determine the mode. Without one, feature flags MUST be
 * evaluated only when consumption initialization is explicitly allowed; other launches MUST remain
 * on legacy billing.
 */
export async function recordExecutionStarted(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  {
    canInitializeConsumption,
  }: {
    // TODO(@id13): Remove this rollout guard once consumption is the only pipeline.
    canInitializeConsumption: boolean;
  }
): Promise<Result<boolean, Error>> {
  const { runKey } = agentLoopArgs;
  if (!runKey) {
    return new Ok(false);
  }
  const context = await resolveExecutionEntryContext(auth, agentLoopArgs);
  if (!context) {
    return new Ok(false);
  }
  const existingMode = await fetchExecutionStartedMode(auth, context);
  const mode =
    existingMode ??
    (canInitializeConsumption
      ? await getAgentMessageConsumptionMode(auth)
      : "off");
  if (mode === "off") {
    return new Ok(false);
  }

  await withTransaction((transaction) =>
    AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "execution_started",
        idempotencyKey: `execution:${runKey}:started`,
        runKey: context.runKey,
        rootAgentMessageModelId: context.rootAgentMessageModelId,
        agentMessageModelId: context.agentMessageModelId,
        consumptionMode: mode,
      },
      transaction,
    })
  );

  const signalRes = await signalConsumptionEventsAppended(auth.toJSON(), {
    runKey: context.runKey,
  });
  if (signalRes.isErr()) {
    return new Err(signalRes.error);
  }
  return new Ok(true);
}

export async function recordExecutionFinalized(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<Result<EnabledAgentMessageConsumptionMode | null, Error>> {
  const context = await resolveExecutionEntryContext(auth, agentLoopArgs);
  if (!context) {
    return new Ok(null);
  }
  const consumptionMode = await fetchExecutionStartedMode(auth, context);
  if (consumptionMode === null) {
    return new Ok(null);
  }
  await withTransaction((transaction) =>
    AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "execution_finalized",
        idempotencyKey: `execution:${context.runKey}:finalized`,
        runKey: context.runKey,
        rootAgentMessageModelId: context.rootAgentMessageModelId,
        agentMessageModelId: context.agentMessageModelId,
        status: context.status,
        consumptionMode,
      },
      transaction,
    })
  );

  const signalRes = await signalConsumptionEventsAppended(auth.toJSON(), {
    runKey: context.runKey,
  });
  if (signalRes.isErr()) {
    return new Err(signalRes.error);
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
  return new Ok(consumptionMode);
}
