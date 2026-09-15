import {
  getAgentMessageConsumptionMode,
  resolveAgentMessageConsumptionMode,
} from "@app/lib/api/assistant/consumption/gate";
import { recordModelCallConsumption } from "@app/lib/api/assistant/consumption/model_call_writer";
import { recordToolCompletionConsumption } from "@app/lib/api/assistant/consumption/tool_completion_writer";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/consumption/client";
import type {
  AgentMessageConsumptionExecutionContext,
  AgentMessageConsumptionMode,
  EnabledAgentMessageConsumptionMode,
} from "@app/types/assistant/agent_message_consumption";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { isRecord, isString } from "@app/types/shared/utils/general";

type ExecutionEntryContext = {
  agentMessageModelId: ModelId;
  parentAgentMessageId: string | null;
  runKey: string;
  status: AgentMessageStatus;
};

type LegacyConsumptionExecutionContext = {
  rootAgentMessageId: string;
  runKey: string;
};

type ConsumptionExecutionLineage =
  | {
      kind: "root";
      rootAgentMessageId: ModelId;
      rootAgentMessagePublicId: string;
      proposedMode: AgentMessageConsumptionExecutionContext["mode"] | "off";
    }
  | {
      kind: "descendant";
      rootAgentMessageId: ModelId;
      consumptionMode: EnabledAgentMessageConsumptionMode;
    };

function isLegacyConsumptionExecutionContext(
  value: unknown
): value is LegacyConsumptionExecutionContext {
  if (typeof value !== "object" || value === null || !isRecord(value)) {
    return false;
  }
  return (
    isString(value.rootAgentMessageId) &&
    value.rootAgentMessageId.length > 0 &&
    isString(value.runKey) &&
    value.runKey.length > 0
  );
}

async function signalPersistedConsumptionWork(
  auth: Authenticator,
  runKey: string
): Promise<void> {
  const signalRes = await signalConsumptionEventsAppended(auth.toJSON(), {
    runKey,
  });
  if (signalRes.isErr()) {
    logger.warn(
      { error: signalRes.error, runKey },
      "Failed to signal persisted consumption work"
    );
  }
}

async function resolveExecutionEntryContext(
  auth: Authenticator,
  {
    agentMessageId,
    runKey,
  }: {
    agentMessageId: string;
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
    parentAgentMessageId: creditContext.parentAgentMessageId,
    runKey,
    status: creditContext.status,
  };
}

export function getLegacyConsumptionExecutionContext(
  agentLoopArgs: AgentLoopArgs
): LegacyConsumptionExecutionContext | null {
  return isLegacyConsumptionExecutionContext(agentLoopArgs)
    ? agentLoopArgs
    : null;
}

async function startConsumptionExecution(
  auth: Authenticator,
  {
    context,
    lineage,
  }: {
    context: ExecutionEntryContext;
    lineage: ConsumptionExecutionLineage;
  }
): Promise<EnabledAgentMessageConsumptionMode | null> {
  const mode = await withTransaction(async (transaction) => {
    let consumptionMode: EnabledAgentMessageConsumptionMode;
    if (lineage.kind === "root") {
      const rolloutMode =
        await ConversationResource.getOrSetAgentMessageConsumptionRolloutMode(
          auth,
          {
            agentMessageId: lineage.rootAgentMessagePublicId,
            mode: lineage.proposedMode,
            transaction,
          }
        );
      if (rolloutMode === null || rolloutMode === "off") {
        return null;
      }
      consumptionMode = rolloutMode;
    } else {
      consumptionMode = lineage.consumptionMode;
    }

    await AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "execution_started",
        idempotencyKey: `execution:${context.runKey}:started`,
        runKey: context.runKey,
        rootAgentMessageId: lineage.rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        consumptionMode,
      },
      transaction,
    });
    return consumptionMode;
  });
  if (mode === null) {
    return null;
  }

  await signalPersistedConsumptionWork(auth, context.runKey);
  return mode;
}

export async function recordModelCallConsumptionActivity(
  authType: AuthenticatorType,
  {
    agentMessageId,
    consumptionContext,
    conversationId,
    dustRunId,
    emittedActionModelIds,
  }: {
    agentMessageId: string;
    consumptionContext: AgentMessageConsumptionExecutionContext;
    conversationId: string;
    dustRunId: string;
    emittedActionModelIds: ModelId[];
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const [creditContext, conversation, emittedActions] = await Promise.all([
    ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    }),
    ConversationResource.fetchById(auth, conversationId, {
      includeDeleted: true,
    }),
    AgentMCPActionResource.fetchByModelIds(auth, emittedActionModelIds),
  ]);
  if (!creditContext || !conversation) {
    logger.info(
      { agentMessageId, conversationId },
      "Skipping consumption for deleted model-call context"
    );
    return;
  }

  const result = await recordModelCallConsumption(auth, {
    context: {
      agentMessageModelId: creditContext.agentMessageModelId,
      conversationModelId: conversation.id,
      rootAgentMessageId: consumptionContext.rootAgentMessageId,
      runKey: consumptionContext.runKey,
    },
    dustRunId,
    emittedActions,
  });
  if (result.isErr()) {
    throw result.error;
  }
}

export async function recordToolCompletionConsumptionActivity(
  authType: AuthenticatorType,
  {
    actionModelId,
    agentMessageId,
    consumptionContext,
  }: {
    actionModelId: ModelId;
    agentMessageId: string;
    consumptionContext: AgentMessageConsumptionExecutionContext;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const [action, creditContext] = await Promise.all([
    AgentMCPActionResource.fetchByModelIdWithAuth(auth, actionModelId),
    ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    }),
  ]);
  if (!action || !creditContext) {
    logger.info(
      { actionModelId, agentMessageId },
      "Skipping consumption for deleted tool context"
    );
    return;
  }

  const result = await recordToolCompletionConsumption(auth, {
    action,
    context: {
      agentMessageId,
      agentMessageModelId: creditContext.agentMessageModelId,
      rootAgentMessageId: consumptionContext.rootAgentMessageId,
      runKey: consumptionContext.runKey,
    },
  });
  if (result.isErr()) {
    throw result.error;
  }
}

/**
 * @cc [owner:id13,label:backend;product] consumption-root-execution-snapshot
 * A root execution MUST use its own numeric agent message ID as its root and snapshot its
 * rollout mode before appending the execution-started event.
 */
/**
 * @cc [owner:id13,label:backend;product] consumption-descendant-execution-inheritance
 * A descendant execution MUST start consumption only when its immediate parent has a persisted
 * execution-started event, and MUST inherit that event's root agent message ID and mode.
 */
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
  const context = await resolveExecutionEntryContext(auth, {
    agentMessageId,
    runKey,
  });
  if (!context) {
    return null;
  }

  let lineage: ConsumptionExecutionLineage;
  if (context.parentAgentMessageId === null) {
    lineage = {
      kind: "root",
      rootAgentMessageId: context.agentMessageModelId,
      rootAgentMessagePublicId: agentMessageId,
      proposedMode:
        startStep === 0
          ? resolveAgentMessageConsumptionMode(auth, {
              mode: await getAgentMessageConsumptionMode(auth),
            })
          : "off",
    };
  } else {
    const parentCreditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId: context.parentAgentMessageId,
      });
    if (!parentCreditContext) {
      return null;
    }
    const parentExecution =
      await AgentMessageConsumptionEventResource.fetchLatestExecutionStartedForAgentMessage(
        auth,
        { agentMessageModelId: parentCreditContext.agentMessageModelId }
      );
    if (!parentExecution) {
      return null;
    }
    lineage = {
      kind: "descendant",
      rootAgentMessageId: parentExecution.rootAgentMessageId,
      consumptionMode: parentExecution.consumptionMode,
    };
  }

  const mode = await startConsumptionExecution(auth, {
    context,
    lineage,
  });
  if (mode === null) {
    return null;
  }
  return {
    mode,
    rootAgentMessageId: lineage.rootAgentMessageId,
    runKey,
  };
}

export async function recordExecutionStarted(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  { startStep }: { startStep: number }
): Promise<boolean> {
  const legacyContext = getLegacyConsumptionExecutionContext(agentLoopArgs);
  if (!legacyContext) {
    return false;
  }
  const { rootAgentMessageId, runKey } = legacyContext;
  const [context, rootCreditContext] = await Promise.all([
    resolveExecutionEntryContext(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey,
    }),
    ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId: rootAgentMessageId,
    }),
  ]);
  if (!context || !rootCreditContext) {
    return false;
  }
  const proposedMode =
    startStep === 0
      ? resolveAgentMessageConsumptionMode(auth, {
          mode: await getAgentMessageConsumptionMode(auth),
        })
      : "off";
  const mode = await startConsumptionExecution(auth, {
    context,
    lineage: {
      kind: "root",
      rootAgentMessageId: rootCreditContext.agentMessageModelId,
      rootAgentMessagePublicId: rootAgentMessageId,
      proposedMode,
    },
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
  let rootAgentMessageId: ModelId;
  let runKey: string;
  let consumptionMode: AgentMessageConsumptionMode | null;
  if (consumptionContext) {
    rootAgentMessageId = consumptionContext.rootAgentMessageId;
    runKey = consumptionContext.runKey;
    consumptionMode = consumptionContext.mode;
  } else {
    const legacyContext = getLegacyConsumptionExecutionContext(agentLoopArgs);
    if (!legacyContext) {
      return null;
    }
    const rootCreditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId: legacyContext.rootAgentMessageId,
      });
    if (!rootCreditContext) {
      return null;
    }
    rootAgentMessageId = rootCreditContext.agentMessageModelId;
    runKey = legacyContext.runKey;
    consumptionMode =
      await ConversationResource.fetchAgentMessageConsumptionRolloutMode(auth, {
        agentMessageId: legacyContext.rootAgentMessageId,
      });
  }
  const context = await resolveExecutionEntryContext(auth, {
    agentMessageId: agentLoopArgs.agentMessageId,
    runKey,
  });
  if (!context) {
    return null;
  }
  if (consumptionMode === null || consumptionMode === "off") {
    return null;
  }
  await withTransaction(async (transaction) => {
    await AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "execution_finalized",
        idempotencyKey: `execution:${context.runKey}:finalized`,
        runKey: context.runKey,
        rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        status: context.status,
        consumptionMode,
      },
      transaction,
    });
  });

  await signalPersistedConsumptionWork(auth, context.runKey);

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
