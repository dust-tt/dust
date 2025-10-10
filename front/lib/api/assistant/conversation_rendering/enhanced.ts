/**
 * Enhanced implementation of renderConversationForModel with pruning capabilities
 * Uses shared functions from common module
 */

import {
  getTextContentFromMessage,
  getTextRepresentationFromMessages,
} from "@app/lib/api/assistant/utils";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import logger from "@app/logger/logger";
import type {
  ConversationType,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActions,
  Result,
} from "@app/types";
import { Err, isContentFragmentMessageTypeModel, Ok } from "@app/types";

import {
  CombinedPruning,
  CurrentInteractionPruning,
  PreviousInteractionsPruning,
  type PruningContext,
  type PruningStrategy,
} from "./pruning";
import { renderAllMessages } from "./shared/message_rendering";
import {
  PRUNED_RESULT_PLACEHOLDER,
  PRUNED_TOOL_RESULT_TOKENS,
} from "./shared/token_utils";

// Extend types to include token counts
type MessageWithTokens = ModelMessageTypeMultiActions & {
  tokenCount: number;
};

type InteractionWithTokens = {
  messages: MessageWithTokens[];
  totalTokens: number;
};

/**
 * Group messages into interactions (user turn + agent responses)
 */
function groupMessagesIntoInteractions(
  messages: MessageWithTokens[]
): InteractionWithTokens[] {
  const interactions: InteractionWithTokens[] = [];
  let currentInteraction: MessageWithTokens[] = [];
  let currentTokens = 0;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    currentInteraction.push(message);
    currentTokens += message.tokenCount;

    // Start a new interaction when we see the next user message
    const isLastMessage = i === messages.length - 1;
    const nextIsUser = !isLastMessage && messages[i + 1].role === "user";

    if (isLastMessage || nextIsUser) {
      interactions.push({
        messages: currentInteraction,
        totalTokens: currentTokens,
      });
      currentInteraction = [];
      currentTokens = 0;
    }
  }

  return interactions;
}

/**
 * Apply pruning to tool results within an interaction
 */
function pruneToolResultsInInteraction(
  interaction: InteractionWithTokens,
  pruningStrategy: PruningStrategy,
  context: Omit<PruningContext, "messageIndex" | "totalMessagesInInteraction">
): InteractionWithTokens {
  const prunedMessages = interaction.messages.map((msg, index) => {
    if (msg.role === "function") {
      const shouldPrune = pruningStrategy.shouldPruneToolResult(msg, {
        ...context,
        messageIndex: index,
        totalMessagesInInteraction: interaction.messages.length,
      });

      if (shouldPrune) {
        return {
          ...msg,
          content: PRUNED_RESULT_PLACEHOLDER,
          tokenCount: PRUNED_TOOL_RESULT_TOKENS,
        };
      }
    }
    return msg;
  });

  const totalTokens = prunedMessages.reduce(
    (sum, msg) => sum + msg.tokenCount,
    0
  );

  return {
    messages: prunedMessages,
    totalTokens,
  };
}

/**
 * Progressively prune tool results from the current interaction to meet token budget
 */
async function progressivelyPruneInteraction(
  interaction: InteractionWithTokens,
  maxTokens: number,
  model: ModelConfigurationType,
  context: Omit<PruningContext, "messageIndex" | "totalMessagesInInteraction">
): Promise<InteractionWithTokens> {
  if (interaction.totalTokens <= maxTokens) {
    return interaction;
  }

  // Find all tool result messages
  const toolResultIndices: number[] = [];
  for (let i = 0; i < interaction.messages.length; i++) {
    if (interaction.messages[i].role === "function") {
      toolResultIndices.push(i);
    }
  }

  // Prune from oldest to newest, recalculating tokens each time
  let prunedInteraction = { ...interaction };
  for (const index of toolResultIndices) {
    const message = prunedInteraction.messages[index];
    if (
      message.role === "function" &&
      message.content !== PRUNED_RESULT_PLACEHOLDER
    ) {
      // Create a new array with the pruned message
      const newMessages = [...prunedInteraction.messages];
      newMessages[index] = {
        ...message,
        content: PRUNED_RESULT_PLACEHOLDER,
        tokenCount: PRUNED_TOOL_RESULT_TOKENS,
      };

      // Recalculate total tokens
      const newTotalTokens = newMessages.reduce(
        (sum, msg) => sum + msg.tokenCount,
        0
      );

      prunedInteraction = {
        messages: newMessages,
        totalTokens: newTotalTokens,
      };

      // Check if we've pruned enough
      if (newTotalTokens <= maxTokens) {
        break;
      }
    }
  }

  return prunedInteraction;
}

export async function renderConversationEnhanced(
  auth: Authenticator,
  {
    conversation,
    model,
    prompt,
    tools,
    allowedTokenCount,
    excludeActions,
    excludeImages,
    onMissingAction = "inject-placeholder",
    enablePreviousInteractionsPruning = false,
    currentInteractionPruningConfig = { keepLastN: 2 },
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
    prompt: string;
    tools: string;
    allowedTokenCount: number;
    excludeActions?: boolean;
    excludeImages?: boolean;
    onMissingAction?: "inject-placeholder" | "skip";
    enablePreviousInteractionsPruning?: boolean;
    currentInteractionPruningConfig?: {
      keepLastN: number;
    };
  }
): Promise<
  Result<
    {
      modelConversation: ModelConversationTypeMultiActions;
      tokensUsed: number;
    },
    Error
  >
> {
  const now = Date.now();

  // Use shared rendering logic
  const messages = await renderAllMessages(auth, {
    conversation,
    model,
    excludeActions,
    excludeImages,
    onMissingAction,
  });

  // Calculate token counts for all messages
  const res = await tokenCountForTexts(
    [prompt, tools, ...getTextRepresentationFromMessages(messages)],
    model
  );
  if (res.isErr()) {
    return new Err(res.error);
  }

  const [promptCount, toolDefinitionsCount, ...messagesCount] = res.value;

  // Add reasoning content token count
  for (const [i, message] of messages.entries()) {
    if (message.role === "assistant") {
      for (const content of message.contents ?? []) {
        if (content.type === "reasoning") {
          messagesCount[i] += content.value.tokens ?? 0;
        }
      }
    }
  }

  // Create messages with token counts
  const messagesWithTokens: MessageWithTokens[] = messages.map((msg, i) => ({
    ...msg,
    tokenCount: messagesCount[i],
  }));

  // Group into interactions
  const interactions = groupMessagesIntoInteractions(messagesWithTokens);

  // Set up pruning strategies
  const strategies: PruningStrategy[] = [];
  if (enablePreviousInteractionsPruning) {
    strategies.push(new PreviousInteractionsPruning());
  }
  strategies.push(
    new CurrentInteractionPruning(currentInteractionPruningConfig.keepLastN)
  );
  const pruningStrategy = new CombinedPruning(strategies);

  // Apply pruning to interactions
  const prunedInteractions = interactions.map((interaction, index) => {
    const context = {
      interactionIndex: index,
      totalInteractions: interactions.length,
      isLastInteraction: index === interactions.length - 1,
    };
    return pruneToolResultsInInteraction(interaction, pruningStrategy, context);
  });

  // Calculate base token usage
  const toolDefinitionsCountAdjustmentFactor = 0.7;
  const tokensMargin = 1024;
  let baseTokens =
    promptCount +
    Math.floor(toolDefinitionsCount * toolDefinitionsCountAdjustmentFactor) +
    tokensMargin;

  // Select interactions that fit within token budget
  const selected: MessageWithTokens[] = [];
  let tokensUsed = baseTokens;

  // Go backward through interactions
  for (let i = prunedInteractions.length - 1; i >= 0; i--) {
    let interaction = prunedInteractions[i];
    const isLastInteraction = i === prunedInteractions.length - 1;

    // For the last interaction, try progressive pruning if needed
    if (isLastInteraction && interaction.totalTokens > allowedTokenCount - tokensUsed) {
      const availableTokens = allowedTokenCount - tokensUsed;
      interaction = await progressivelyPruneInteraction(
        interaction,
        availableTokens,
        model,
        {
          interactionIndex: i,
          totalInteractions: prunedInteractions.length,
          isLastInteraction: true,
        }
      );
    }

    if (tokensUsed + interaction.totalTokens <= allowedTokenCount) {
      tokensUsed += interaction.totalTokens;
      selected.unshift(...interaction.messages);
    } else {
      break;
    }
  }

  // Merge content fragments into user messages
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

  // Remove leading assistant/function messages
  while (
    selected.length > 0 &&
    ["assistant", "function"].includes(selected[0].role)
  ) {
    const removedTokens = selected[0].tokenCount;
    tokensUsed -= removedTokens;
    selected.shift();
  }

  if (selected.length === 0) {
    return new Err(
      new Error("Context window exceeded: at least one message is required")
    );
  }

  // Remove tokenCount from final messages
  const finalMessages: ModelMessageTypeMultiActions[] = selected.map(
    ({ tokenCount, ...msg }) => msg
  );

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      messageCount: messages.length,
      promptToken: promptCount,
      tokensUsed,
      messageSelected: finalMessages.length,
      elapsed: Date.now() - now,
      pruningEnabled: enablePreviousInteractionsPruning,
    },
    "[ASSISTANT_TRACE] renderConversationForModelEnhanced"
  );

  return new Ok({
    modelConversation: {
      messages: finalMessages,
    },
    tokensUsed,
  });
}