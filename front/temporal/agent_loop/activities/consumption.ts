import { appendConsumptionEvent } from "@app/lib/api/assistant/consumption/events";
import {
  getAgentMessageConsumptionMode,
  resolveAgentMessageConsumptionMode,
} from "@app/lib/api/assistant/consumption/gate";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/consumption/client";
import type { EnabledAgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

type ExecutionEntryContext = {
  agentMessageModelId: ModelId;
  rootAgentMessageId: string;
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

  return {
    agentMessageModelId: creditContext.agentMessageModelId,
    rootAgentMessageId,
    runKey,
    status: creditContext.status,
  };
}

export async function recordExecutionStarted(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  {
    isRootAgentMessage,
    startStep,
  }: {
    isRootAgentMessage: boolean;
    startStep: number;
  }
): Promise<boolean> {
  const { runKey } = agentLoopArgs;
  if (!runKey) {
    return false;
  }
  const context = await resolveExecutionEntryContext(auth, agentLoopArgs);
  if (!context) {
    return false;
  }
  const proposedMode =
    startStep === 0
      ? resolveAgentMessageConsumptionMode(auth, {
          mode: await getAgentMessageConsumptionMode(auth),
        })
      : "off";

  const started = await withTransaction(async (transaction) => {
    const mode = await ConversationResource.getOrSetAgentMessageConsumptionMode(
      auth,
      {
        agentMessageId: context.rootAgentMessageId,
        mode: proposedMode,
        transaction,
      }
    );
    if (mode === null || mode === "off") {
      return false;
    }

    await appendConsumptionEvent(
      auth,
      {
        kind: "execution_started",
        idempotencyKey: `execution:${runKey}:started`,
        runKey: context.runKey,
        rootAgentMessageId: context.rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        subagentAgentMessageId:
          !isRootAgentMessage && startStep === 0
            ? context.agentMessageModelId
            : null,
        consumptionMode: mode,
      },
      { transaction }
    );
    return true;
  });
  if (!started) {
    return false;
  }

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
  const consumptionMode =
    await ConversationResource.fetchAgentMessageConsumptionMode(auth, {
      agentMessageId: context.rootAgentMessageId,
    });
  if (consumptionMode === null || consumptionMode === "off") {
    return null;
  }
  await withTransaction(async (transaction) => {
    await appendConsumptionEvent(
      auth,
      {
        kind: "execution_finalized",
        idempotencyKey: `execution:${context.runKey}:finalized`,
        runKey: context.runKey,
        rootAgentMessageId: context.rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        status: context.status,
        consumptionMode,
      },
      { transaction }
    );
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
