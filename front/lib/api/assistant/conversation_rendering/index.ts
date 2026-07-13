import { groupMessagesIntoInteractions } from "@app/lib/api/assistant/conversation/interactions";
import { renderAllMessages } from "@app/lib/api/assistant/conversation_rendering/message_rendering";
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
import type { InteractionWithTokens, MessageWithTokens } from "./pruning";
import {
  dropInteractionsToFit,
  getInteractionTokenCount,
  pruneToolResults,
  TOOL_RESULTS_TO_PRESERVE,
} from "./pruning";

// How many of the most recent interactions dropInteractionsToFit never drops entirely, even if
// their own tool results were already redacted. A different floor from TOOL_RESULTS_TO_PRESERVE
// (pruning.ts). That one protects tool result content regardless of turn. This one protects whole
// recent turns from being erased regardless of how many tool calls they made.
export const PREVIOUS_INTERACTIONS_TO_PRESERVE = 3;

// Fixed number of tokens assumed for image contents
const IMAGE_CONTENT_TOKEN_COUNT = 3100;
export const TOOL_DEFINITIONS_COUNT_ADJUSTMENT_FACTOR = 0.7;
export const TOKENS_MARGIN = 1024;

// Proactive redaction target as a fraction of contextSize, picked to sit below the customer-facing
// compaction warning (~70%) rather than the real ceiling (68-99% depending on model), which would
// otherwise leave pruning inactive until compaction has already fired. Applies to the whole
// conversation, current interaction included. No separate, looser budget for it.
export const PRUNING_TARGET_CONTEXT_UTILIZATION = 0.6;

/**
 * Escalates through redaction and dropping until the conversation fits budgetForInteractions, or
 * returns an error if even the last resort isn't enough. Four layers, each tried only if the
 * previous one left the conversation over budget: redact proactively (up to pruningBudget),
 * drop old interactions entirely (never the current one), force redaction into the protected
 * floor, then force dropping past the protected floor.
 *
 * pruneToolResults and dropInteractionsToFit are each called twice, once with their normal floor
 * and once with a floor of 0. This is safe because both floors work off the CURRENT state: a
 * message pruneToolResults already redacted is already at the placeholder size, so redacting it
 * again would save nothing and its own eligibility check excludes it, and an interaction
 * dropInteractionsToFit already dropped is simply gone from the array, so there's nothing left
 * for the second call to reconsider. Each call only ever reaches further than the one before it.
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
): Result<
  { interactions: InteractionWithTokens[]; prunedContext: boolean },
  Error
> {
  let redacted = pruneToolResults(
    interactions,
    pruningBudget,
    TOOL_RESULTS_TO_PRESERVE
  );
  let prunedContext = redacted !== interactions;
  let totalTokens = redacted.reduce(
    (sum, interaction) => sum + getInteractionTokenCount(interaction),
    0
  );

  if (totalTokens > budgetForInteractions) {
    const currentInteraction = redacted[redacted.length - 1];
    const previousBefore = redacted.slice(0, -1);
    const previousAfter = dropInteractionsToFit(
      previousBefore,
      budgetForInteractions - getInteractionTokenCount(currentInteraction),
      PREVIOUS_INTERACTIONS_TO_PRESERVE
    );
    if (previousAfter !== previousBefore) {
      prunedContext = true;
    }
    redacted = [...previousAfter, currentInteraction];
    totalTokens = redacted.reduce(
      (sum, interaction) => sum + getInteractionTokenCount(interaction),
      0
    );
  }

  if (totalTokens > budgetForInteractions) {
    logger.warn(
      { ...logDetails, totalTokens, budgetForInteractions },
      "Dropped every eligible previous interaction; still over budget, forcing floor redaction."
    );
    redacted = pruneToolResults(redacted, budgetForInteractions, 0);
    prunedContext = true;
    totalTokens = redacted.reduce(
      (sum, interaction) => sum + getInteractionTokenCount(interaction),
      0
    );
  }

  if (totalTokens > budgetForInteractions) {
    logger.warn(
      { ...logDetails, totalTokens, budgetForInteractions },
      "Floor redaction still not enough; dropping previous interactions past the normal floor."
    );
    const currentInteraction = redacted[redacted.length - 1];
    const previousBefore = redacted.slice(0, -1);
    const previousAfter = dropInteractionsToFit(
      previousBefore,
      budgetForInteractions - getInteractionTokenCount(currentInteraction),
      0
    );
    if (previousAfter !== previousBefore) {
      prunedContext = true;
    }
    redacted = [...previousAfter, currentInteraction];
    totalTokens = redacted.reduce(
      (sum, interaction) => sum + getInteractionTokenCount(interaction),
      0
    );
  }

  if (totalTokens > budgetForInteractions) {
    logger.error(
      {
        ...logDetails,
        failureStage: "interaction_exceeds_after_pruning",
        totalTokens,
        budgetForInteractions,
      },
      "Render Conversation V2: No interactions fit in context window."
    );
    return new Err(
      new Error("Context window exceeded: at least one message is required")
    );
  }

  return new Ok({ interactions: redacted, prunedContext });
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
  // push baseTokens past the target alone, and a negative value would make the floor redact by
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
    return pruneRes;
  }
  const { interactions: redactedInteractions, prunedContext } = pruneRes.value;
  const totalTokens = redactedInteractions.reduce(
    (sum, interaction) => sum + getInteractionTokenCount(interaction),
    0
  );

  const selected: MessageWithTokens[] = redactedInteractions.flatMap(
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

  if (selected.length === 0) {
    logger.error(
      {
        ...logDetails,
        failureStage: "no_interactions_selected",
        tokensUsed,
        budgetForInteractions,
        selectedMessageCount: selected.length,
      },
      "Render Conversation V2: No interactions fit in context window."
    );
    return new Err(
      new Error("Context window exceeded: at least one message is required")
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
