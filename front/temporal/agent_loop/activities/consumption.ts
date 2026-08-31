import { appendConsumptionEvent } from "@app/lib/api/assistant/consumption/events";
import {
  getAgentMessageConsumptionMode,
  resolveAgentMessageConsumptionMode,
} from "@app/lib/api/assistant/consumption/gate";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/consumption/client";
import type {
  AgentMessageConsumptionExecutionContext,
  EnabledAgentMessageConsumptionMode,
} from "@app/types/assistant/agent_message_consumption";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { z } from "zod";

const legacyConsumptionContextSchema = z.object({
  rootAgentMessageId: z.string().min(1),
  runKey: z.string().min(1),
});

type ExecutionEntryContext = {
  agentMessageModelId: ModelId;
  rootAgentMessageId: string;
  runKey: string;
  status: AgentMessageStatus;
};

async function resolveExecutionEntryContext(
  auth: Authenticator,
  {
    agentMessageId,
    rootAgentMessageId,
    runKey,
  }: {
    agentMessageId: string;
    rootAgentMessageId: string;
    runKey: string;
  }
): Promise<ExecutionEntryContext | null> {
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

export function getLegacyConsumptionExecutionContext(
  agentLoopArgs: AgentLoopArgs
): Pick<
  AgentMessageConsumptionExecutionContext,
  "rootAgentMessageId" | "runKey"
> | null {
  const parsed = legacyConsumptionContextSchema.safeParse(agentLoopArgs);
  return parsed.success ? parsed.data : null;
}

async function startConsumptionExecution(
  auth: Authenticator,
  {
    agentMessageId,
    isRootAgentMessage,
    proposedMode,
    rootAgentMessageId,
    runKey,
    startStep,
  }: {
    agentMessageId: string;
    isRootAgentMessage: boolean;
    proposedMode: AgentMessageConsumptionExecutionContext["mode"] | "off";
    rootAgentMessageId: string;
    runKey: string;
    startStep: number;
  }
): Promise<EnabledAgentMessageConsumptionMode | null> {
  const context = await resolveExecutionEntryContext(auth, {
    agentMessageId,
    rootAgentMessageId,
    runKey,
  });
  if (!context) {
    return null;
  }

  const mode = await withTransaction(async (transaction) => {
    const rolloutMode =
      await ConversationResource.getOrSetAgentMessageConsumptionRolloutMode(
        auth,
        {
          agentMessageId: rootAgentMessageId,
          mode: proposedMode,
          transaction,
        }
      );
    if (rolloutMode === null || rolloutMode === "off") {
      return null;
    }

    await appendConsumptionEvent(
      auth,
      {
        kind: "execution_started",
        idempotencyKey: `execution:${runKey}:started`,
        runKey,
        rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        subagentAgentMessageId:
          !isRootAgentMessage && startStep === 0
            ? context.agentMessageModelId
            : null,
        consumptionMode: rolloutMode,
      },
      { transaction }
    );
    return rolloutMode;
  });
  if (mode === null) {
    return null;
  }

  const signalRes = await signalConsumptionEventsAppended(auth.toJSON(), {
    runKey,
  });
  if (signalRes.isErr()) {
    throw signalRes.error;
  }
  return mode;
}

export async function initializeConsumptionExecutionActivity(
  authType: AuthenticatorType,
  {
    agentMessageId,
    runKey,
    startStep,
  }: {
    agentMessageId: string;
    runKey: string;
    startStep: number;
  }
): Promise<AgentMessageConsumptionExecutionContext | null> {
  const auth = await Authenticator.fromJSON(authType);
  const rootAgentMessageId = await ConversationResource.findRootAgentMessageId(
    auth,
    {
      agentMessageId,
    }
  );
  const proposedMode =
    agentMessageId === rootAgentMessageId && startStep === 0
      ? resolveAgentMessageConsumptionMode(auth, {
          mode: await getAgentMessageConsumptionMode(auth),
        })
      : "off";
  const mode = await startConsumptionExecution(auth, {
    agentMessageId,
    isRootAgentMessage: agentMessageId === rootAgentMessageId,
    proposedMode,
    rootAgentMessageId,
    runKey,
    startStep,
  });
  if (mode === null) {
    return null;
  }
  return { mode, rootAgentMessageId, runKey };
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
  const legacyContext = getLegacyConsumptionExecutionContext(agentLoopArgs);
  if (!legacyContext) {
    return false;
  }
  const { rootAgentMessageId, runKey } = legacyContext;
  const proposedMode =
    startStep === 0
      ? resolveAgentMessageConsumptionMode(auth, {
          mode: await getAgentMessageConsumptionMode(auth),
        })
      : "off";
  const mode = await startConsumptionExecution(auth, {
    agentMessageId: agentLoopArgs.agentMessageId,
    isRootAgentMessage,
    proposedMode,
    rootAgentMessageId,
    runKey,
    startStep,
  });
  return mode !== null;
}

export async function recordExecutionFinalized(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  consumptionContext?: AgentMessageConsumptionExecutionContext | null
): Promise<EnabledAgentMessageConsumptionMode | null> {
  if (consumptionContext === null) {
    return null;
  }
  const identity =
    consumptionContext ?? getLegacyConsumptionExecutionContext(agentLoopArgs);
  if (!identity) {
    return null;
  }
  const context = await resolveExecutionEntryContext(auth, {
    agentMessageId: agentLoopArgs.agentMessageId,
    rootAgentMessageId: identity.rootAgentMessageId,
    runKey: identity.runKey,
  });
  if (!context) {
    return null;
  }
  const consumptionMode =
    consumptionContext?.mode ??
    (await ConversationResource.fetchAgentMessageConsumptionRolloutMode(auth, {
      agentMessageId: context.rootAgentMessageId,
    }));
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
