import { groupMessagesIntoInteractions } from "@app/lib/api/assistant/conversation/interactions";
import { CheckpointedConversationWindowState } from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import type { ConversationRenderingMetricsCaller } from "@app/lib/api/assistant/conversation_rendering/instrumentation";
import {
  emitConversationRenderingError,
  emitConversationRenderingMetrics,
} from "@app/lib/api/assistant/conversation_rendering/instrumentation";
import { renderAllMessages } from "@app/lib/api/assistant/conversation_rendering/message_rendering";
import type {
  InteractionWithTokens,
  MessageWithTokens,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import {
  IMAGE_CONTENT_TOKEN_COUNT,
  sumInteractionTokens,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import type { ConversationWindowResult } from "@app/lib/api/assistant/conversation_rendering/window_types";
import type { EnabledSkill } from "@app/lib/api/assistant/skills_rendering";
import { getTextContentFromMessage } from "@app/lib/api/assistant/utils";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ConversationType } from "@app/types/assistant/conversation";
import type {
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types/assistant/generation";
import {
  isContentFragmentMessageTypeModel,
  isImageContent,
  isTextContent,
} from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { CredentialsType } from "@app/types/provider";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

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

/**
 * Replays the conversation chronologically so consumed tool results are pruned at stable
 * checkpoints without removing complete interactions.
 */
function pruneConversationToBudget(
  interactions: InteractionWithTokens[],
  {
    pruningBudget,
    budgetForInteractions,
    logDetails,
  }: {
    pruningBudget: number;
    budgetForInteractions: number;
    logDetails: Record<string, unknown>;
  }
): Result<ConversationWindowResult, Error> {
  const state = CheckpointedConversationWindowState.empty({
    pruningBudget,
    budgetForInteractions,
    logDetails,
  });

  for (const interaction of interactions) {
    state.append(interaction);
  }

  return state.fit();
}

export async function renderConversationForModel(
  auth: Authenticator,
  {
    leadingMessages = [],
    conversation,
    model,
    prompt,
    tools,
    allowedTokenCount,
    excludeActions,
    excludeImages,
    onMissingAction = "inject-placeholder",
    agentConfiguration,
    enabledSkills,
    metricsCaller,
  }: {
    leadingMessages?: ModelMessageTypeMultiActionsWithoutContentFragment[];
    conversation: ConversationType;
    model: ModelConfigurationType;
    prompt: string;
    tools: string;
    allowedTokenCount: number;
    excludeActions?: boolean;
    excludeImages?: boolean;
    onMissingAction?: "inject-placeholder" | "skip";
    enablePreviousInteractionsPruning?: boolean;
    agentConfiguration?: AgentLoopExecutionData["agentConfiguration"];
    enabledSkills: EnabledSkill[];
    // Opt-in StatsD emission. This function has callers with very different budgets (Dust app
    // history injection, reinforcement batches, scripts) whose renders would skew the pruning
    // dashboards, so only callers that name themselves are measured.
    metricsCaller?: ConversationRenderingMetricsCaller;
  }
): Promise<
  Result<
    {
      modelConversation: ModelConversationTypeMultiActions;
      tokensUsed: number;
      prunedContext: boolean;
    },
    Error
  >
> {
  const now = Date.now();
  let stepStart = now;

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
  const renderAllMessagesMs = Date.now() - stepStart;
  stepStart = Date.now();

  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const getLlmCredentialsMs = Date.now() - stepStart;
  stepStart = Date.now();

  // Tokenize messages and prompt/tools in parallel to reduce latency
  const countMessagesPromise = (async () => {
    const start = Date.now();
    const r = await countTokensForMessages(messages, model, credentials);
    return { r, elapsedMs: Date.now() - start };
  })();
  const countPromptToolsPromise = (async () => {
    const start = Date.now();
    const r = await tokenCountForTexts([prompt, tools], model, credentials);
    return { r, elapsedMs: Date.now() - start };
  })();
  const [messagesWithTokensWrapped, promptToolsWrapped] = await Promise.all([
    countMessagesPromise,
    countPromptToolsPromise,
  ]);
  const parallelTokenizationWallMs = Date.now() - stepStart;
  const countTokensForMessagesMs = messagesWithTokensWrapped.elapsedMs;
  const tokenCountPromptToolsMs = promptToolsWrapped.elapsedMs;
  const messagesWithTokensRes = messagesWithTokensWrapped.r;
  const promptToolsRes = promptToolsWrapped.r;

  stepStart = Date.now();

  if (messagesWithTokensRes.isErr()) {
    return messagesWithTokensRes;
  }

  if (promptToolsRes.isErr()) {
    return promptToolsRes;
  }

  const messagesWithTokens = messagesWithTokensRes.value;
  const [promptCount, toolDefinitionsCount] = promptToolsRes.value;

  // Calculate base token usage.
  const baseTokens =
    promptCount +
    Math.floor(
      toolDefinitionsCount * TOOL_DEFINITIONS_COUNT_ADJUSTMENT_FACTOR
    ) +
    TOKENS_MARGIN;

  const interactions = groupMessagesIntoInteractions(messagesWithTokens);

  // Hard ceiling shared by every interaction combined: previous history plus the current,
  // still-in-progress turn.
  const budgetForInteractions = allowedTokenCount - baseTokens;

  // Only applied when positive: a small-context model with a large prompt/tools footprint can
  // push baseTokens past the target alone, and a negative value would make the floor prune by
  // default instead of as a last resort.
  const pruningTargetCeiling =
    model.contextSize * PRUNING_TARGET_CONTEXT_UTILIZATION - baseTokens;
  const pruningBudget =
    pruningTargetCeiling > 0
      ? Math.min(budgetForInteractions, pruningTargetCeiling)
      : budgetForInteractions;

  const logDetails = {
    workspaceId: conversation.owner.sId,
    conversationId: conversation.sId,
    agentConfigurationId: agentConfiguration?.sId,
    allowedTokenCount,
    model: {
      providerId: model.providerId,
      modelId: model.modelId,
      contextSize: model.contextSize,
      generationTokensCount: model.generationTokensCount,
      tokenCountAdjustment: model.tokenCountAdjustment,
      tokenizer: model.tokenizer,
    },
    baseTokens,
    promptCount,
    toolDefinitionsCount,
    tokensMargin: TOKENS_MARGIN,
    messageCount: messages.length,
    interactionCount: interactions.length,
    pokeUrl: `https://poke.dust.tt/${conversation.owner.sId}/conversation/${conversation.sId}`,
  };

  const pruneRes = pruneConversationToBudget(interactions, {
    pruningBudget,
    budgetForInteractions,
    logDetails,
  });
  if (pruneRes.isErr()) {
    if (metricsCaller) {
      emitConversationRenderingError({
        kind: "context_overflow",
        caller: metricsCaller,
        providerId: model.providerId,
        modelId: model.modelId,
      });
    }
    return pruneRes;
  }
  const {
    interactions: prunedInteractions,
    prunedContext,
    stats: pruningStats,
  } = pruneRes.value;
  const totalTokens = sumInteractionTokens(prunedInteractions);

  const selected: MessageWithTokens[] = prunedInteractions.flatMap(
    (interaction) => interaction.messages
  );
  const tokensUsed = baseTokens + totalTokens;

  // Merge content fragments into user messages.
  for (let i = selected.length - 1; i >= 0; i--) {
    const cfMessage = selected[i];
    if (isContentFragmentMessageTypeModel(cfMessage)) {
      const userMessage = selected[i + 1];
      if (!userMessage || userMessage.role !== "user") {
        logger.error(
          {
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            selected: selected.map((m) => ({
              ...m,
              content:
                getTextContentFromMessage(m)?.slice(0, 100) + " (truncated...)",
            })),
          },
          "Unexpected state, cannot find user message after a Content Fragment"
        );
        throw new Error(
          "Unexpected state, cannot find user message after a Content Fragment"
        );
      }

      userMessage.content = [...cfMessage.content, ...userMessage.content];
      selected.splice(i, 1);
    }
  }

  // Only reachable when the conversation had no messages to begin with: pruning never drops the
  // current interaction, and the merge above throws before it could empty one out. Not a context
  // window problem, despite living downstream of the budget machinery.
  if (selected.length === 0) {
    logger.error(
      {
        ...logDetails,
        failureStage: "no_messages_to_render",
        tokensUsed,
        budgetForInteractions,
      },
      "Render Conversation V2: conversation has no messages to render."
    );
    if (metricsCaller) {
      emitConversationRenderingError({
        kind: "no_messages",
        caller: metricsCaller,
        providerId: model.providerId,
        modelId: model.modelId,
      });
    }
    return new Err(
      new Error("Conversation contains no messages: at least one is required")
    );
  }

  // Remove tokenCount from final messages and remove content fragments from return type
  const finalMessages = selected
    .map(({ tokenCount: _tokenCount, ...msg }) => msg)
    // There should be no content fragments as they have been merged into user messages
    // TODO: refactor how we define the selected array
    .filter(
      (
        message
      ): message is ModelMessageTypeMultiActionsWithoutContentFragment =>
        message.role !== "content_fragment"
    );

  const pruneSelectAndFinalizeMs = Date.now() - stepStart;

  if (metricsCaller) {
    emitConversationRenderingMetrics({
      stats: pruningStats,
      caller: metricsCaller,
      providerId: model.providerId,
      modelId: model.modelId,
      contextSize: model.contextSize,
      tokensUsed,
    });
  }

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      messageCount: messages.length,
      promptToken: promptCount,
      tokensUsed,
      messageSelected: finalMessages.length,
      prunedContext,
      elapsed: Date.now() - now,
      renderAllMessagesMs,
      getLlmCredentialsMs,
      countTokensForMessagesMs,
      tokenCountPromptToolsMs,
      parallelTokenizationWallMs,
      pruneSelectAndFinalizeMs,
    },
    "[ASSISTANT_TRACE] renderConversationForModelEnhanced"
  );

  return new Ok({
    modelConversation: {
      messages: finalMessages,
    },
    tokensUsed,
    prunedContext,
  });
}

async function countTokensForMessages(
  messages: ModelMessageTypeMultiActions[],
  model: ModelConfigurationType,
  credentials: CredentialsType
): Promise<Result<MessageWithTokens[], Error>> {
  const textRepresentations: string[] = [];
  const additionalTokens: number[] = [];

  for (const [i, m] of messages.entries()) {
    additionalTokens[i] = 0;

    let text = `${m.role} ${"name" in m ? m.name : ""} `;

    if (m.role === "user" || m.role === "content_fragment") {
      const textContents: string[] = [];
      for (const c of m.content) {
        if (isTextContent(c)) {
          textContents.push(c.text);
        } else if (isImageContent(c)) {
          additionalTokens[i] += IMAGE_CONTENT_TOKEN_COUNT;
        } else {
          assertNever(c);
        }
      }
      text += textContents.join("\n");
    } else if (m.role === "assistant") {
      //  Use the `contents` if available.
      if (m.contents?.length) {
        for (const c of m.contents) {
          if (c.type === "reasoning") {
            additionalTokens[i] += c.value.tokens;
          } else if (c.type === "text_content") {
            text += c.value;
          } else if (c.type === "function_call") {
            text += `${c.value.name} ${c.value.arguments}`;
          } else if (c.type === "provider_passthrough") {
            // Opaque provider block, not counted here.
          } else {
            assertNever(c);
          }
        }
      } else if (m.content) {
        // Fallback to legacy `content` field if `contents` is not available.
        text += m.content;
      }
    } else if (m.role === "function") {
      const content = Array.isArray(m.content)
        ? m.content
        : [{ type: "text" as const, text: m.content }];
      const textContents: string[] = [];
      for (const c of content) {
        if (isTextContent(c)) {
          textContents.push(c.text);
        } else if (isImageContent(c)) {
          additionalTokens[i] += IMAGE_CONTENT_TOKEN_COUNT;
        } else {
          assertNever(c);
        }
      }
      text += textContents.join("\n");
    } else if (m.role === "compaction") {
      text += m.content;
    } else {
      assertNever(m);
    }

    textRepresentations.push(text);
  }

  const res = await tokenCountForTexts(textRepresentations, model, credentials);
  if (res.isErr()) {
    return res;
  }

  const textCounts = res.value;

  return new Ok(
    textCounts.map((count, i) => ({
      ...messages[i],
      tokenCount: count + additionalTokens[i],
    }))
  );
}
