import { groupMessagesIntoInteractions } from "@app/lib/api/assistant/conversation/interactions";
import { CheckpointedConversationWindowState } from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import type { ConversationWindowCheckpoint } from "@app/lib/api/assistant/conversation_rendering/conversation_window_checkpoint";
import type { ConversationRenderingMetricsCaller } from "@app/lib/api/assistant/conversation_rendering/instrumentation";
import {
  emitConversationRenderingError,
  emitConversationRenderingMetrics,
} from "@app/lib/api/assistant/conversation_rendering/instrumentation";
import { renderAllMessages } from "@app/lib/api/assistant/conversation_rendering/message_rendering";
import type { MessageWithTokens } from "@app/lib/api/assistant/conversation_rendering/pruning";
import { sumInteractionTokens } from "@app/lib/api/assistant/conversation_rendering/pruning";
import type { ConversationWindowResult } from "@app/lib/api/assistant/conversation_rendering/window_types";
import type { EnabledSkill } from "@app/lib/api/assistant/skills_rendering";
import { getTextContentFromMessage } from "@app/lib/api/assistant/utils";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import logger from "@app/logger/logger";
import type { AgentConfigurationWithoutModelType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type {
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types/assistant/generation";
import { isImageContent, isTextContent } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { CredentialsType } from "@app/types/provider";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const IMAGE_CONTENT_TOKEN_COUNT = 3100;
export const TOOL_DEFINITIONS_COUNT_ADJUSTMENT_FACTOR = 0.7;
export const TOKENS_MARGIN = 1024;

// Compaction remains available once enough previous interactions exist, independently of how
// tool results are pruned from the model context.
export const PREVIOUS_INTERACTIONS_TO_PRESERVE = 3;

// Proactive pruning target as a fraction of contextSize, picked to sit below the customer-facing
// compaction warning (~70%) rather than the real ceiling (68-99% depending on model), which would
// otherwise leave pruning inactive until compaction has already fired. Applies to the whole
// conversation, current interaction included. No separate, looser budget for it.
export const PRUNING_TARGET_CONTEXT_UTILIZATION = 0.6;

export type ConversationRenderingInput = {
  leadingMessages?: ModelMessageTypeMultiActionsWithoutContentFragment[];
  model: ModelConfigurationType;
  prompt: string;
  tools: string;
  allowedTokenCount: number;
  excludeActions?: boolean;
  excludeImages?: boolean;
  onMissingAction?: "inject-placeholder" | "skip";
  enablePreviousInteractionsPruning?: boolean;
  agentConfiguration?: AgentConfigurationWithoutModelType;
  enabledSkills: EnabledSkill[];
  // Opt-in StatsD emission. Callers have different budgets, so unnamed renders would skew the
  // pruning dashboards.
  metricsCaller?: ConversationRenderingMetricsCaller;
};

export type RenderConversationForModelResult = {
  modelConversation: ModelConversationTypeMultiActions;
  tokensUsed: number;
  prunedContext: boolean;
};

export type ConversationWindowSource =
  | {
      kind: "full";
      conversation: ConversationType;
    }
  | {
      kind: "checkpoint_exact";
      conversation: ConversationType;
      checkpoint: ConversationWindowCheckpoint;
    }
  | {
      // A previous-step checkpoint can only be extended by more messages from the same agent
      // interaction. New user turns require a full render until cross-message checkpoints exist.
      kind: "checkpoint_continuation";
      conversation: ConversationType;
      continuation: ConversationType;
      checkpoint: ConversationWindowCheckpoint;
    };

type ConversationWindowCheckpointData = Pick<
  ConversationWindowCheckpoint,
  "state" | "promptTokens" | "toolDefinitionTokens"
>;

export type RenderConversationWindowResult =
  RenderConversationForModelResult & {
    checkpointData: ConversationWindowCheckpointData;
  };

type RenderingTimings = {
  renderAllMessagesMs: number;
  getLlmCredentialsMs: number;
  countTokensForMessagesMs: number;
  tokenCountPromptToolsMs: number;
  parallelTokenizationWallMs: number;
};

type ConversationRenderingLogDetails = Record<string, unknown> & {
  messageCount: number;
};

type BuiltConversationWindow = {
  state: CheckpointedConversationWindowState;
  window: ConversationWindowResult;
  conversation: ConversationType;
  promptTokens: number;
  toolDefinitionTokens: number;
  baseTokens: number;
  budgetForInteractions: number;
  logDetails: ConversationRenderingLogDetails;
  timings: RenderingTimings;
  startedAtMs: number;
  windowProcessingStartedAtMs: number;
  metricsCaller?: ConversationRenderingMetricsCaller;
  model: ModelConfigurationType;
};

type PreparedMessages = {
  messages: ModelMessageTypeMultiActions[];
  messagesWithTokens: MessageWithTokens[];
  promptTokens: number;
  toolDefinitionTokens: number;
  timings: RenderingTimings;
};

async function prepareFullMessages(
  auth: Authenticator,
  input: ConversationRenderingInput,
  conversation: ConversationType
): Promise<Result<PreparedMessages, Error>> {
  const {
    leadingMessages = [],
    model,
    prompt,
    tools,
    excludeActions,
    excludeImages,
    onMissingAction = "inject-placeholder",
    agentConfiguration,
    enabledSkills,
  } = input;

  const renderStartedAtMs = Date.now();
  const renderedMessages = await renderAllMessages(auth, {
    conversation,
    model,
    excludeActions,
    excludeImages,
    onMissingAction,
    agentConfiguration,
    enabledSkills,
  });
  const messages = [...leadingMessages, ...renderedMessages];
  const renderAllMessagesMs = Date.now() - renderStartedAtMs;

  const credentialsStartedAtMs = Date.now();
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const getLlmCredentialsMs = Date.now() - credentialsStartedAtMs;
  const tokenizationStartedAtMs = Date.now();
  const countMessagesPromise = (async () => {
    const startedAtMs = Date.now();
    const result = await countTokensForMessages(messages, model, credentials);
    return { result, elapsedMs: Date.now() - startedAtMs };
  })();
  const countPromptToolsPromise = (async () => {
    const startedAtMs = Date.now();
    const result = await tokenCountForTexts(
      [prompt, tools],
      model,
      credentials
    );
    return { result, elapsedMs: Date.now() - startedAtMs };
  })();
  const [messagesWithTokens, promptTools] = await Promise.all([
    countMessagesPromise,
    countPromptToolsPromise,
  ]);
  const parallelTokenizationWallMs = Date.now() - tokenizationStartedAtMs;

  if (messagesWithTokens.result.isErr()) {
    return messagesWithTokens.result;
  }
  if (promptTools.result.isErr()) {
    return promptTools.result;
  }

  return new Ok({
    messages,
    messagesWithTokens: messagesWithTokens.result.value,
    promptTokens: promptTools.result.value[0],
    toolDefinitionTokens: promptTools.result.value[1],
    timings: {
      renderAllMessagesMs,
      getLlmCredentialsMs,
      countTokensForMessagesMs: messagesWithTokens.elapsedMs,
      tokenCountPromptToolsMs: promptTools.elapsedMs,
      parallelTokenizationWallMs,
    },
  });
}

async function prepareCheckpointContinuation(
  auth: Authenticator,
  input: ConversationRenderingInput,
  source: Extract<ConversationWindowSource, { kind: "checkpoint_continuation" }>
): Promise<Result<PreparedMessages, Error>> {
  const {
    model,
    excludeActions,
    excludeImages,
    onMissingAction = "inject-placeholder",
    agentConfiguration,
    enabledSkills,
  } = input;
  const renderStartedAtMs = Date.now();
  const messages = await renderAllMessages(auth, {
    conversation: source.continuation,
    model,
    excludeActions,
    excludeImages,
    onMissingAction,
    agentConfiguration,
    enabledSkills,
  });
  const renderAllMessagesMs = Date.now() - renderStartedAtMs;

  const credentialsStartedAtMs = Date.now();
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const getLlmCredentialsMs = Date.now() - credentialsStartedAtMs;
  const tokenizationStartedAtMs = Date.now();
  const messagesWithTokens = await countTokensForMessages(
    messages,
    model,
    credentials
  );
  const countTokensForMessagesMs = Date.now() - tokenizationStartedAtMs;
  if (messagesWithTokens.isErr()) {
    return messagesWithTokens;
  }

  return new Ok({
    messages,
    messagesWithTokens: messagesWithTokens.value,
    promptTokens: source.checkpoint.promptTokens,
    toolDefinitionTokens: source.checkpoint.toolDefinitionTokens,
    timings: {
      renderAllMessagesMs,
      getLlmCredentialsMs,
      countTokensForMessagesMs,
      tokenCountPromptToolsMs: 0,
      parallelTokenizationWallMs: countTokensForMessagesMs,
    },
  });
}

async function buildConversationWindow(
  auth: Authenticator,
  input: ConversationRenderingInput,
  source: ConversationWindowSource
): Promise<Result<BuiltConversationWindow, Error>> {
  const startedAtMs = Date.now();
  let prepared: PreparedMessages;
  let checkpoint: ConversationWindowCheckpoint | null;
  switch (source.kind) {
    case "full": {
      const preparedResult = await prepareFullMessages(
        auth,
        input,
        source.conversation
      );
      if (preparedResult.isErr()) {
        return preparedResult;
      }
      prepared = preparedResult.value;
      checkpoint = null;
      break;
    }
    case "checkpoint_continuation": {
      const preparedResult = await prepareCheckpointContinuation(
        auth,
        input,
        source
      );
      if (preparedResult.isErr()) {
        return preparedResult;
      }
      prepared = preparedResult.value;
      checkpoint = source.checkpoint;
      break;
    }
    case "checkpoint_exact":
      prepared = {
        messages: [],
        messagesWithTokens: [],
        promptTokens: source.checkpoint.promptTokens,
        toolDefinitionTokens: source.checkpoint.toolDefinitionTokens,
        timings: {
          renderAllMessagesMs: 0,
          getLlmCredentialsMs: 0,
          countTokensForMessagesMs: 0,
          tokenCountPromptToolsMs: 0,
          parallelTokenizationWallMs: 0,
        },
      };
      checkpoint = source.checkpoint;
      break;
    default:
      assertNever(source);
  }

  const windowProcessingStartedAtMs = Date.now();
  const baseTokens =
    prepared.promptTokens +
    Math.floor(
      prepared.toolDefinitionTokens * TOOL_DEFINITIONS_COUNT_ADJUSTMENT_FACTOR
    ) +
    TOKENS_MARGIN;
  const interactions = groupMessagesIntoInteractions(
    prepared.messagesWithTokens
  );
  if (source.kind === "checkpoint_continuation" && interactions.length > 1) {
    return new Err(
      new Error("A checkpoint continuation must belong to one interaction")
    );
  }
  const budgetForInteractions = input.allowedTokenCount - baseTokens;
  const pruningTargetCeiling =
    input.model.contextSize * PRUNING_TARGET_CONTEXT_UTILIZATION - baseTokens;
  const pruningBudget =
    pruningTargetCeiling > 0
      ? Math.min(budgetForInteractions, pruningTargetCeiling)
      : budgetForInteractions;
  const logDetails: ConversationRenderingLogDetails = {
    workspaceId: source.conversation.owner.sId,
    conversationId: source.conversation.sId,
    agentConfigurationId: input.agentConfiguration?.sId,
    allowedTokenCount: input.allowedTokenCount,
    model: {
      providerId: input.model.providerId,
      modelId: input.model.modelId,
      contextSize: input.model.contextSize,
      generationTokensCount: input.model.generationTokensCount,
      tokenCountAdjustment: input.model.tokenCountAdjustment,
      tokenizer: input.model.tokenizer,
    },
    baseTokens,
    promptCount: prepared.promptTokens,
    toolDefinitionsCount: prepared.toolDefinitionTokens,
    tokensMargin: TOKENS_MARGIN,
    messageCount:
      (checkpoint?.state.interactions.reduce(
        (count, interaction) => count + interaction.messages.length,
        0
      ) ?? 0) + prepared.messages.length,
    interactionCount:
      checkpoint === null
        ? interactions.length
        : checkpoint.state.interactions.length +
          Math.max(0, interactions.length - 1),
    pokeUrl: `https://poke.dust.tt/${source.conversation.owner.sId}/conversation/${source.conversation.sId}`,
  };

  const state = checkpoint
    ? CheckpointedConversationWindowState.restore(checkpoint.state, {
        pruningBudget,
        budgetForInteractions,
        logDetails,
      })
    : CheckpointedConversationWindowState.empty({
        pruningBudget,
        budgetForInteractions,
        logDetails,
      });

  for (let index = 0; index < interactions.length; index++) {
    if (source.kind === "checkpoint_continuation" && index === 0) {
      state.appendToLatestInteraction(interactions[index]);
    } else {
      state.append(interactions[index]);
    }
  }

  const window = state.fit();
  if (window.isErr()) {
    if (input.metricsCaller) {
      emitConversationRenderingError({
        kind: "context_overflow",
        caller: input.metricsCaller,
        providerId: input.model.providerId,
        modelId: input.model.modelId,
      });
    }
    return window;
  }

  return new Ok({
    state,
    window: window.value,
    conversation: source.conversation,
    promptTokens: prepared.promptTokens,
    toolDefinitionTokens: prepared.toolDefinitionTokens,
    baseTokens,
    budgetForInteractions,
    logDetails,
    timings: prepared.timings,
    startedAtMs,
    windowProcessingStartedAtMs,
    metricsCaller: input.metricsCaller,
    model: input.model,
  });
}

function finalizeConversationWindow(
  built: BuiltConversationWindow
): Result<RenderConversationForModelResult, Error> {
  const {
    interactions: prunedInteractions,
    prunedContext,
    stats: pruningStats,
  } = built.window;
  const totalTokens = sumInteractionTokens(prunedInteractions);
  const selected = prunedInteractions.flatMap(
    (interaction) => interaction.messages
  );
  const tokensUsed = built.baseTokens + totalTokens;

  const finalMessages: ModelMessageTypeMultiActionsWithoutContentFragment[] =
    [];
  let pendingContentFragments: Extract<
    MessageWithTokens,
    { role: "content_fragment" }
  >[] = [];

  for (const message of selected) {
    if (
      pendingContentFragments.length > 0 &&
      message.role !== "user" &&
      message.role !== "content_fragment"
    ) {
      logger.error(
        {
          workspaceId: built.conversation.owner.sId,
          conversationId: built.conversation.sId,
          selected: selected.map((message) => ({
            ...message,
            content:
              getTextContentFromMessage(message)?.slice(0, 100) +
              " (truncated...)",
          })),
        },
        "Unexpected state, cannot find user message after a Content Fragment"
      );
      return new Err(
        new Error(
          "Unexpected state, cannot find user message after a Content Fragment"
        )
      );
    }

    switch (message.role) {
      case "content_fragment":
        pendingContentFragments.push(message);
        break;
      case "user": {
        const { tokenCount: _tokenCount, ...messageWithoutTokens } = message;
        finalMessages.push({
          ...messageWithoutTokens,
          content: [
            ...pendingContentFragments.flatMap((fragment) => fragment.content),
            ...message.content,
          ],
        });
        pendingContentFragments = [];
        break;
      }
      case "assistant":
      case "compaction":
      case "function": {
        const { tokenCount: _tokenCount, ...messageWithoutTokens } = message;
        finalMessages.push(messageWithoutTokens);
        break;
      }
      default:
        assertNever(message);
    }
  }

  if (pendingContentFragments.length > 0) {
    return new Err(
      new Error(
        "Unexpected state, cannot find user message after a Content Fragment"
      )
    );
  }

  if (finalMessages.length === 0) {
    logger.error(
      {
        ...built.logDetails,
        failureStage: "no_messages_to_render",
        tokensUsed,
        budgetForInteractions: built.budgetForInteractions,
      },
      "Render Conversation V2: conversation has no messages to render."
    );
    if (built.metricsCaller) {
      emitConversationRenderingError({
        kind: "no_messages",
        caller: built.metricsCaller,
        providerId: built.model.providerId,
        modelId: built.model.modelId,
      });
    }
    return new Err(
      new Error("Conversation contains no messages: at least one is required")
    );
  }

  if (built.metricsCaller) {
    emitConversationRenderingMetrics({
      stats: pruningStats,
      caller: built.metricsCaller,
      providerId: built.model.providerId,
      modelId: built.model.modelId,
      contextSize: built.model.contextSize,
      tokensUsed,
    });
  }

  logger.info(
    {
      workspaceId: built.conversation.owner.sId,
      conversationId: built.conversation.sId,
      messageCount: built.logDetails.messageCount,
      promptToken: built.promptTokens,
      tokensUsed,
      messageSelected: finalMessages.length,
      prunedContext,
      elapsed: Date.now() - built.startedAtMs,
      ...built.timings,
      pruneSelectAndFinalizeMs: Date.now() - built.windowProcessingStartedAtMs,
    },
    "[ASSISTANT_TRACE] renderConversationForModelEnhanced"
  );

  return new Ok({
    modelConversation: { messages: finalMessages },
    tokensUsed,
    prunedContext,
  });
}

export async function renderConversationWindow(
  auth: Authenticator,
  input: ConversationRenderingInput,
  source: ConversationWindowSource
): Promise<Result<RenderConversationWindowResult, Error>> {
  const built = await buildConversationWindow(auth, input, source);
  if (built.isErr()) {
    return built;
  }

  const finalized = finalizeConversationWindow(built.value);
  if (finalized.isErr()) {
    return finalized;
  }

  switch (source.kind) {
    case "checkpoint_exact":
      return new Ok({
        ...finalized.value,
        checkpointData: {
          state: source.checkpoint.state,
          promptTokens: source.checkpoint.promptTokens,
          toolDefinitionTokens: source.checkpoint.toolDefinitionTokens,
        },
      });
    case "checkpoint_continuation":
    case "full":
      return new Ok({
        ...finalized.value,
        checkpointData: {
          state: built.value.state.snapshot(),
          promptTokens: built.value.promptTokens,
          toolDefinitionTokens: built.value.toolDefinitionTokens,
        },
      });
    default:
      assertNever(source);
  }
}

export async function renderConversationForModel(
  auth: Authenticator,
  {
    conversation,
    ...input
  }: ConversationRenderingInput & { conversation: ConversationType }
): Promise<Result<RenderConversationForModelResult, Error>> {
  const built = await buildConversationWindow(auth, input, {
    kind: "full",
    conversation,
  });
  if (built.isErr()) {
    return built;
  }

  return finalizeConversationWindow(built.value);
}

async function countTokensForMessages(
  messages: ModelMessageTypeMultiActions[],
  model: ModelConfigurationType,
  credentials: CredentialsType
): Promise<Result<MessageWithTokens[], Error>> {
  const textRepresentations: string[] = [];
  const additionalTokens: number[] = [];

  for (const [index, message] of messages.entries()) {
    additionalTokens[index] = 0;
    let text = `${message.role} ${"name" in message ? message.name : ""} `;

    if (message.role === "user" || message.role === "content_fragment") {
      const textContents: string[] = [];
      for (const content of message.content) {
        if (isTextContent(content)) {
          textContents.push(content.text);
        } else if (isImageContent(content)) {
          additionalTokens[index] += IMAGE_CONTENT_TOKEN_COUNT;
        } else {
          assertNever(content);
        }
      }
      text += textContents.join("\n");
    } else if (message.role === "assistant") {
      if (message.contents?.length) {
        for (const content of message.contents) {
          if (content.type === "reasoning") {
            additionalTokens[index] += content.value.tokens;
          } else if (content.type === "text_content") {
            text += content.value;
          } else if (content.type === "function_call") {
            text += `${content.value.name} ${content.value.arguments}`;
          } else if (content.type === "provider_passthrough") {
            // Opaque provider block, not counted here.
          } else {
            assertNever(content);
          }
        }
      } else if (message.content) {
        text += message.content;
      }
    } else if (message.role === "function") {
      const content = Array.isArray(message.content)
        ? message.content
        : [{ type: "text" as const, text: message.content }];
      const textContents: string[] = [];
      for (const item of content) {
        if (isTextContent(item)) {
          textContents.push(item.text);
        } else if (isImageContent(item)) {
          additionalTokens[index] += IMAGE_CONTENT_TOKEN_COUNT;
        } else {
          assertNever(item);
        }
      }
      text += textContents.join("\n");
    } else if (message.role === "compaction") {
      text += message.content;
    } else {
      assertNever(message);
    }

    textRepresentations.push(text);
  }

  const result = await tokenCountForTexts(
    textRepresentations,
    model,
    credentials
  );
  if (result.isErr()) {
    return result;
  }

  return new Ok(
    result.value.map((count, index) => ({
      ...messages[index],
      tokenCount: count + additionalTokens[index],
    }))
  );
}
