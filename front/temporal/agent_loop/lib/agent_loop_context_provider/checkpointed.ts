import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getConversationForCheckpoint } from "@app/lib/api/assistant/conversation_rendering/checkpoint_conversation";
import type {
  ConversationWindowCheckpoint,
  ConversationWindowCheckpointIdentity,
} from "@app/lib/api/assistant/conversation_rendering/conversation_window_checkpoint";
import {
  computeConversationWindowProfileHash,
  loadConversationWindowCheckpoint,
  makeConversationWindowCheckpoint,
  publishConversationWindowCheckpoint,
} from "@app/lib/api/assistant/conversation_rendering/conversation_window_checkpoint";
import type {
  ConversationRenderingInput,
  ConversationWindowSource,
} from "@app/lib/api/assistant/conversation_rendering/conversation_window_core";
import {
  PREVIOUS_INTERACTIONS_TO_PRESERVE,
  renderConversationWindow,
} from "@app/lib/api/assistant/conversation_rendering/conversation_window_core";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { prepareFullContextProvider } from "@app/temporal/agent_loop/lib/agent_loop_context_provider/full";
import {
  getMissingActionCatcherFunctionCallIds,
  prepareRuntimeData,
} from "@app/temporal/agent_loop/lib/agent_loop_context_provider/shared";
import type { AgentLoopContextProvider } from "@app/temporal/agent_loop/lib/agent_loop_context_provider/types";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type {
  AgentLoopArgs,
  FullAgentLoopDataWithAuth,
} from "@app/types/assistant/agent_run";
import {
  buildAgentLoopDataFromConversation,
  getFullAgentLoopDataWithAuth,
} from "@app/types/assistant/agent_run";
import type { ConversationType } from "@app/types/assistant/conversation";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

type CheckpointStatus = "missing" | "exact" | "previous" | "rejected";

type ResolvedConversationWindowSource = {
  checkpointStatus: CheckpointStatus;
  source: ConversationWindowSource;
  missingActionCatcherFunctionCallIds: string[];
};

type CheckpointedContext = {
  agentLoopArgs: AgentLoopArgs;
  conversation: ConversationType;
  localMissingActionCatcherFunctionCallIds: string[];
  sourceCheckpoint: ConversationWindowCheckpoint | null;
  targetIdentity: ConversationWindowCheckpointIdentity;
};

function identitiesMatchExceptStep(
  source: ConversationWindowCheckpointIdentity,
  target: ConversationWindowCheckpointIdentity
): boolean {
  return (
    source.workspaceId === target.workspaceId &&
    source.conversationId === target.conversationId &&
    source.agentMessageId === target.agentMessageId &&
    source.agentMessageVersion === target.agentMessageVersion
  );
}

function checkpointCanSeedTarget(
  checkpoint: ConversationWindowCheckpoint,
  target: ConversationWindowCheckpointIdentity,
  profileHash: string
): boolean {
  return (
    checkpoint.validUntilMs > Date.now() &&
    checkpoint.profileHash === profileHash &&
    identitiesMatchExceptStep(checkpoint.identity, target) &&
    (checkpoint.identity.step === target.step ||
      checkpoint.identity.step === target.step - 1)
  );
}

function conversationForCheckpointContinuation(
  conversation: ConversationType,
  checkpoint: ConversationWindowCheckpoint
): Result<ConversationType, Error> {
  for (const versions of conversation.content) {
    const message = versions.find(
      (candidate) =>
        isAgentMessageType(candidate) &&
        candidate.sId === checkpoint.identity.agentMessageId &&
        candidate.version === checkpoint.identity.agentMessageVersion
    );
    if (message && isAgentMessageType(message)) {
      return new Ok({
        ...conversation,
        content: [
          [
            {
              ...message,
              contents: message.contents.filter(
                (content) => content.step === checkpoint.identity.step
              ),
              actions: message.actions.filter(
                (action) => action.step === checkpoint.identity.step
              ),
            },
          ],
        ],
      });
    }
  }

  return new Err(
    new Error("Agent message not found while rendering checkpoint continuation")
  );
}

async function loadSourceCheckpoint(
  identity: ConversationWindowCheckpointIdentity,
  { preferExactCheckpoint }: { preferExactCheckpoint: boolean }
): Promise<Result<ConversationWindowCheckpoint | null, Error>> {
  const previousStep = identity.step > 0 ? [identity.step - 1] : [];
  let candidateSteps = [...previousStep, identity.step];
  if (preferExactCheckpoint) {
    candidateSteps = [identity.step, ...previousStep];
  }

  for (const candidateStep of candidateSteps) {
    const checkpointResult = await loadConversationWindowCheckpoint({
      ...identity,
      step: candidateStep,
    });
    if (checkpointResult.isErr()) {
      return checkpointResult;
    }
    if (checkpointResult.value) {
      return checkpointResult;
    }
  }

  return new Ok(null);
}

async function loadFullConversationForStep(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  step: number
): Promise<Result<ConversationType, Error>> {
  // biome-ignore lint/plugin/noExpensiveConversationFetch: checkpoint rejection requires the authoritative context
  const result = await getConversation(
    auth,
    agentLoopArgs.conversationId,
    false,
    PREVIOUS_INTERACTIONS_TO_PRESERVE + 1
  );
  if (result.isErr()) {
    return result;
  }

  return new Ok(
    sliceConversationForAgentMessage(result.value, {
      agentMessageId: agentLoopArgs.agentMessageId,
      agentMessageVersion: agentLoopArgs.agentMessageVersion,
      step,
    }).slicedConversation
  );
}

async function resolveConversationWindowSource(
  auth: Authenticator,
  {
    context,
    profileHash,
  }: {
    context: CheckpointedContext;
    profileHash: string;
  }
): Promise<Result<ResolvedConversationWindowSource, Error>> {
  const {
    agentLoopArgs,
    conversation,
    localMissingActionCatcherFunctionCallIds,
    sourceCheckpoint,
    targetIdentity,
  } = context;

  if (!sourceCheckpoint) {
    return new Ok({
      checkpointStatus: "missing",
      source: { kind: "full", conversation },
      missingActionCatcherFunctionCallIds:
        localMissingActionCatcherFunctionCallIds,
    });
  }

  if (!checkpointCanSeedTarget(sourceCheckpoint, targetIdentity, profileHash)) {
    const fullConversation = await loadFullConversationForStep(
      auth,
      agentLoopArgs,
      targetIdentity.step
    );
    if (fullConversation.isErr()) {
      return fullConversation;
    }

    return new Ok({
      checkpointStatus: "rejected",
      source: { kind: "full", conversation: fullConversation.value },
      missingActionCatcherFunctionCallIds:
        getMissingActionCatcherFunctionCallIds(fullConversation.value),
    });
  }

  if (sourceCheckpoint.identity.step === targetIdentity.step) {
    return new Ok({
      checkpointStatus: "exact",
      source: {
        kind: "checkpoint_exact",
        conversation,
        checkpoint: sourceCheckpoint,
      },
      missingActionCatcherFunctionCallIds:
        sourceCheckpoint.missingActionCatcherFunctionCallIds,
    });
  }

  const continuation = conversationForCheckpointContinuation(
    conversation,
    sourceCheckpoint
  );
  if (continuation.isErr()) {
    return continuation;
  }

  return new Ok({
    checkpointStatus: "previous",
    source: {
      kind: "checkpoint_continuation",
      conversation,
      continuation: continuation.value,
      checkpoint: sourceCheckpoint,
    },
    missingActionCatcherFunctionCallIds:
      localMissingActionCatcherFunctionCallIds,
  });
}

function shouldPublishCheckpoint(status: CheckpointStatus): boolean {
  switch (status) {
    case "exact":
      return false;

    case "missing":
    case "previous":
    case "rejected":
      return true;

    default:
      return assertNever(status);
  }
}

async function renderCheckpointedConversation(
  auth: Authenticator,
  input: ConversationRenderingInput,
  context: CheckpointedContext
): ReturnType<AgentLoopContextProvider["render"]> {
  const startedAtMs = Date.now();
  const { sourceCheckpoint, targetIdentity } = context;
  const profileHash = computeConversationWindowProfileHash({
    model: input.model,
    prompt: input.prompt,
    tools: input.tools,
    allowedTokenCount: input.allowedTokenCount,
    leadingMessages: input.leadingMessages ?? [],
    excludeActions: input.excludeActions,
    excludeImages: input.excludeImages,
    onMissingAction: input.onMissingAction,
    agentConfigurationId: input.agentConfiguration?.sId,
  });

  const sourceResult = await resolveConversationWindowSource(auth, {
    context,
    profileHash,
  });
  if (sourceResult.isErr()) {
    return sourceResult;
  }

  const resolvedSource = sourceResult.value;

  const renderedResult = await renderConversationWindow(
    auth,
    input,
    resolvedSource.source
  );
  if (renderedResult.isErr()) {
    return renderedResult;
  }

  let rendered = renderedResult.value;
  let missingActionCatcherFunctionCallIds =
    resolvedSource.missingActionCatcherFunctionCallIds;

  if (shouldPublishCheckpoint(resolvedSource.checkpointStatus)) {
    const localCheckpoint = makeConversationWindowCheckpoint({
      identity: targetIdentity,
      profileHash,
      promptTokens: rendered.checkpointData.promptTokens,
      toolDefinitionTokens: rendered.checkpointData.toolDefinitionTokens,
      missingActionCatcherFunctionCallIds,
      state: rendered.checkpointData.state,
    });
    const winnerResult =
      await publishConversationWindowCheckpoint(localCheckpoint);

    if (winnerResult.isErr()) {
      logger.warn(
        { ...targetIdentity, error: winnerResult.error },
        "Failed to publish conversation window checkpoint, continuing without it"
      );
    } else if (
      !winnerResult.value.created &&
      winnerResult.value.checkpoint.profileHash === profileHash
    ) {
      const winner = winnerResult.value.checkpoint;
      const winnerResultForModel = await renderConversationWindow(
        auth,
        { ...input, metricsCaller: undefined },
        {
          kind: "checkpoint_exact",
          conversation: resolvedSource.source.conversation,
          checkpoint: winner,
        }
      );
      if (winnerResultForModel.isErr()) {
        return winnerResultForModel;
      }

      rendered = winnerResultForModel.value;
      missingActionCatcherFunctionCallIds =
        winner.missingActionCatcherFunctionCallIds;
    }
  }

  logger.info(
    {
      ...targetIdentity,
      checkpointStep: sourceCheckpoint?.identity.step,
      checkpointStatus: resolvedSource.checkpointStatus,
      elapsedMs: Date.now() - startedAtMs,
    },
    "[ASSISTANT_TRACE] render agent loop conversation window"
  );

  const { checkpointData: _checkpointData, ...modelContext } = rendered;
  return new Ok({
    ...modelContext,
    missingActionCatcherFunctionCallIds,
  });
}

export async function prepareAgentLoopContextProvider(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  {
    featureFlags,
    isActivityRetry,
    step,
  }: {
    featureFlags: WhitelistableFeature[];
    isActivityRetry: boolean;
    step: number;
  }
): Promise<Result<AgentLoopContextProvider, Error>> {
  if (!featureFlags.includes("stateful_conversation_window")) {
    return prepareFullContextProvider(auth, agentLoopArgs, step);
  }

  const targetIdentity: ConversationWindowCheckpointIdentity = {
    workspaceId: auth.getNonNullableWorkspace().sId,
    conversationId: agentLoopArgs.conversationId,
    agentMessageId: agentLoopArgs.agentMessageId,
    agentMessageVersion: agentLoopArgs.agentMessageVersion,
    step,
  };

  const checkpointStartedAtMs = Date.now();
  const sourceCheckpointResult = await loadSourceCheckpoint(targetIdentity, {
    preferExactCheckpoint: isActivityRetry,
  });
  if (sourceCheckpointResult.isErr()) {
    logger.warn(
      { ...targetIdentity, error: sourceCheckpointResult.error },
      "Failed to load conversation window checkpoint, using full rendering"
    );
    return prepareFullContextProvider(auth, agentLoopArgs, step);
  }
  const sourceCheckpoint = sourceCheckpointResult.value;
  const checkpointLoadMs = Date.now() - checkpointStartedAtMs;

  const dataStartedAtMs = Date.now();
  let dataResult: Result<FullAgentLoopDataWithAuth, Error>;
  if (sourceCheckpoint) {
    const conversationResult = await getConversationForCheckpoint(
      auth,
      agentLoopArgs.conversationId,
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        targetStep: step,
        userMessageId: agentLoopArgs.userMessageId,
      }
    );
    if (conversationResult.isErr()) {
      logger.warn(
        { ...targetIdentity, error: conversationResult.error },
        "Failed to load bounded model context, using full conversation"
      );

      return prepareFullContextProvider(auth, agentLoopArgs, step);
    }

    dataResult = await buildAgentLoopDataFromConversation(
      auth,
      agentLoopArgs,
      conversationResult.value
    );
  } else {
    dataResult = await getFullAgentLoopDataWithAuth(auth, agentLoopArgs);
  }

  if (dataResult.isErr()) {
    if (sourceCheckpoint) {
      logger.warn(
        { ...targetIdentity, error: dataResult.error },
        "Failed to load bounded model context, using full conversation"
      );

      return prepareFullContextProvider(auth, agentLoopArgs, step);
    }

    return dataResult;
  }

  const { conversation, runtimeData } = prepareRuntimeData(
    dataResult.value,
    step
  );
  const localMissingActionCatcherFunctionCallIds = [
    ...new Set([
      ...(sourceCheckpoint?.missingActionCatcherFunctionCallIds ?? []),
      ...getMissingActionCatcherFunctionCallIds(conversation),
    ]),
  ];

  logger.info(
    {
      ...targetIdentity,
      checkpointStep: sourceCheckpoint?.identity.step,
      checkpointLoadMs,
      getAgentLoopDataMs: Date.now() - dataStartedAtMs,
    },
    "[ASSISTANT_TRACE] prepare checkpointed conversation window"
  );

  return new Ok({
    runtimeData,
    render: (input) =>
      renderCheckpointedConversation(auth, input, {
        agentLoopArgs,
        conversation,
        localMissingActionCatcherFunctionCallIds,
        sourceCheckpoint,
        targetIdentity,
      }),
  });
}
