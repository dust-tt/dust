import { getAgentMessageConsumptionMode } from "@app/lib/api/assistant/consumption/mode_switch";
import { recordModelCallConsumption } from "@app/lib/api/assistant/consumption/model_call_writer";
import { recordToolCompletionConsumption } from "@app/lib/api/assistant/consumption/tool_completion_writer";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/credit_consumption/client";
import type {
  AgentMessageConsumptionExecutionContext,
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

type ConsumptionExecutionLineage = {
  rootAgentMessageModelId: ModelId;
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

async function fetchExecutionStarted(
  auth: Authenticator,
  {
    agentMessageModelId,
    fallbackAgentMessageModelId,
  }: {
    agentMessageModelId: ModelId;
    fallbackAgentMessageModelId?: ModelId;
  }
): Promise<ConsumptionExecutionLineage | null> {
  const executionStarted =
    await AgentMessageConsumptionEventResource.fetchLatestExecutionStartedForAgentMessage(
      auth,
      { agentMessageModelId }
    );
  if (executionStarted || fallbackAgentMessageModelId === undefined) {
    return executionStarted;
  }
  return AgentMessageConsumptionEventResource.fetchLatestExecutionStartedForAgentMessage(
    auth,
    { agentMessageModelId: fallbackAgentMessageModelId }
  );
}

/**
 * @cc [owner:id13,label:backend;product] legacy-consumption-event-source
 * Legacy activity inputs MUST derive their execution context from execution-started events. An
 * absent event MUST keep the execution on legacy billing.
 */
export async function resolveLegacyConsumptionExecutionContext(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<AgentMessageConsumptionExecutionContext | null> {
  const legacyContext = getLegacyConsumptionExecutionContext(agentLoopArgs);
  if (!legacyContext) {
    return null;
  }
  const isRootExecution =
    agentLoopArgs.agentMessageId === legacyContext.rootAgentMessageId;
  const [context, rootCreditContext] = await Promise.all([
    resolveExecutionEntryContext(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey: legacyContext.runKey,
    }),
    isRootExecution
      ? Promise.resolve(null)
      : ConversationResource.fetchAgentMessageCreditContext(auth, {
          agentMessageId: legacyContext.rootAgentMessageId,
        }),
  ]);
  if (!context || (!isRootExecution && !rootCreditContext)) {
    return null;
  }
  const rootAgentMessageModelId =
    rootCreditContext?.agentMessageModelId ?? context.agentMessageModelId;
  const executionStarted = await fetchExecutionStarted(auth, {
    agentMessageModelId: context.agentMessageModelId,
    fallbackAgentMessageModelId: rootAgentMessageModelId,
  });
  if (!executionStarted) {
    return null;
  }
  return {
    mode: executionStarted.consumptionMode,
    rootAgentMessageModelId: executionStarted.rootAgentMessageModelId,
    runKey: legacyContext.runKey,
  };
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
  await withTransaction((transaction) =>
    AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "execution_started",
        idempotencyKey: `execution:${context.runKey}:started`,
        runKey: context.runKey,
        rootAgentMessageModelId: lineage.rootAgentMessageModelId,
        agentMessageModelId: context.agentMessageModelId,
        consumptionMode: lineage.consumptionMode,
      },
      transaction,
    })
  );

  await signalPersistedConsumptionWork(auth, context.runKey);
  return lineage.consumptionMode;
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
      rootAgentMessageId: consumptionContext.rootAgentMessageModelId,
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
      rootAgentMessageId: consumptionContext.rootAgentMessageModelId,
      runKey: consumptionContext.runKey,
    },
  });
  if (result.isErr()) {
    throw result.error;
  }
}

/**
 * @cc [owner:id13,label:backend;product] consumption-root-execution-snapshot
 * A root execution MUST reuse its latest execution-started mode. Without one, feature flags MUST be
 * evaluated and an execution-started event appended only when consumption initialization is
 * explicitly allowed.
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
    canInitializeConsumption,
    runKey,
  }: {
    agentMessageId: string;
    // TODO(@id13): Remove this rollout guard once consumption is the only pipeline.
    canInitializeConsumption: boolean;
    runKey: string;
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
    const existingExecution = await fetchExecutionStarted(auth, {
      agentMessageModelId: context.agentMessageModelId,
    });
    if (existingExecution) {
      lineage = existingExecution;
    } else {
      if (!canInitializeConsumption) {
        return null;
      }
      const mode = await getAgentMessageConsumptionMode(auth);
      if (mode === "off") {
        return null;
      }
      lineage = {
        rootAgentMessageModelId: context.agentMessageModelId,
        consumptionMode: mode,
      };
    }
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
      rootAgentMessageModelId: parentExecution.rootAgentMessageModelId,
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
    rootAgentMessageModelId: lineage.rootAgentMessageModelId,
    runKey,
  };
}

export async function recordExecutionStarted(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  {
    canInitializeConsumption,
  }: {
    // TODO(@id13): Remove this rollout guard once consumption is the only pipeline.
    canInitializeConsumption: boolean;
  }
): Promise<boolean> {
  const legacyContext = getLegacyConsumptionExecutionContext(agentLoopArgs);
  if (!legacyContext) {
    return false;
  }
  const { rootAgentMessageId, runKey } = legacyContext;
  const isRootExecution = agentLoopArgs.agentMessageId === rootAgentMessageId;
  const [context, rootCreditContext] = await Promise.all([
    resolveExecutionEntryContext(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey,
    }),
    isRootExecution
      ? Promise.resolve(null)
      : ConversationResource.fetchAgentMessageCreditContext(auth, {
          agentMessageId: rootAgentMessageId,
        }),
  ]);
  if (!context || (!isRootExecution && !rootCreditContext)) {
    return false;
  }
  const rootAgentMessageModelId =
    rootCreditContext?.agentMessageModelId ?? context.agentMessageModelId;
  let lineage = await fetchExecutionStarted(auth, {
    agentMessageModelId: context.agentMessageModelId,
    fallbackAgentMessageModelId: rootAgentMessageModelId,
  });
  if (!lineage) {
    if (!canInitializeConsumption) {
      return false;
    }
    const mode = await getAgentMessageConsumptionMode(auth);
    if (mode === "off") {
      return false;
    }
    lineage = {
      rootAgentMessageModelId,
      consumptionMode: mode,
    };
  }
  const mode = await startConsumptionExecution(auth, {
    context,
    lineage,
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
  let rootAgentMessageModelId: ModelId;
  let runKey: string;
  let consumptionMode: EnabledAgentMessageConsumptionMode | null;
  if (consumptionContext) {
    rootAgentMessageModelId = consumptionContext.rootAgentMessageModelId;
    runKey = consumptionContext.runKey;
    consumptionMode = consumptionContext.mode;
  } else {
    const legacyConsumptionContext =
      await resolveLegacyConsumptionExecutionContext(auth, agentLoopArgs);
    if (!legacyConsumptionContext) {
      return null;
    }
    rootAgentMessageModelId = legacyConsumptionContext.rootAgentMessageModelId;
    runKey = legacyConsumptionContext.runKey;
    consumptionMode = legacyConsumptionContext.mode;
  }
  const context = await resolveExecutionEntryContext(auth, {
    agentMessageId: agentLoopArgs.agentMessageId,
    runKey,
  });
  if (!context) {
    return null;
  }
  if (consumptionMode === null) {
    return null;
  }
  await withTransaction((transaction) =>
    AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "execution_finalized",
        idempotencyKey: `execution:${context.runKey}:finalized`,
        runKey: context.runKey,
        rootAgentMessageModelId,
        agentMessageModelId: context.agentMessageModelId,
        status: context.status,
        consumptionMode,
      },
      transaction,
    })
  );

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
