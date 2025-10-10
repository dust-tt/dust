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

import type { InteractionWithTokens, MessageWithTokens } from "./pruning";
import {
  getInteractionTokenCount,
  progressivelyPruneInteraction,
  pruneAllToolResults,
} from "./pruning";
import { renderAllMessages } from "./shared/message_rendering";

/**
 * Group messages into interactions (user turn + agent responses).
 */
function groupMessagesIntoInteractions(
  messages: MessageWithTokens[]
): InteractionWithTokens[] {
  const interactions: InteractionWithTokens[] = [];
  let currentInteraction: MessageWithTokens[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    currentInteraction.push(message);

    // Start a new interaction when we see the next user message.
    const isLastMessage = i === messages.length - 1;
    const nextIsUser = !isLastMessage && messages[i + 1].role === "user";

    if (isLastMessage || nextIsUser) {
      interactions.push({
        messages: currentInteraction,
      });
      currentInteraction = [];
    }
  }

  return interactions;
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

  const messages = await renderAllMessages(auth, {
    conversation,
    model,
    excludeActions,
    excludeImages,
    onMissingAction,
  });

  const res = await tokenCountForTexts(
    [prompt, tools, ...getTextRepresentationFromMessages(messages)],
    model
  );
  if (res.isErr()) {
    return new Err(res.error);
  }

  const [promptCount, toolDefinitionsCount, ...messagesCount] = res.value;

  // Add reasoning content token count.
  for (const [i, message] of messages.entries()) {
    if (message.role === "assistant") {
      for (const content of message.contents ?? []) {
        if (content.type === "reasoning") {
          messagesCount[i] += content.value.tokens ?? 0;
        }
      }
    }
  }

  const messagesWithTokens: MessageWithTokens[] = messages.map((msg, i) => ({
    ...msg,
    tokenCount: messagesCount[i],
  }));

  const interactions = groupMessagesIntoInteractions(messagesWithTokens);

  // Apply pruning to previous interactions (all but the last) if enabled.
  const prunedInteractions = interactions.map((interaction, index) => {
    const isLastInteraction = index === interactions.length - 1;

    if (!enablePreviousInteractionsPruning || isLastInteraction) {
      return interaction;
    }

    return pruneAllToolResults(interaction);
  });

  // Calculate base token usage.
  const toolDefinitionsCountAdjustmentFactor = 0.7;
  const tokensMargin = 1024;
  const baseTokens =
    promptCount +
    Math.floor(toolDefinitionsCount * toolDefinitionsCountAdjustmentFactor) +
    tokensMargin;

  // Select interactions that fit within token budget.
  const selected: MessageWithTokens[] = [];
  let tokensUsed = baseTokens;

  // Go backward through interactions.
  for (let i = prunedInteractions.length - 1; i >= 0; i--) {
    let interaction = prunedInteractions[i];
    const isLastInteraction = i === prunedInteractions.length - 1;

    // For the last interaction, try progressive pruning if it doesn't fit within the token budget.
    // This means the we progressively prune the earliest tools results until the interaction fits within the token budget.
    const interactionTokens = getInteractionTokenCount(interaction);
    if (
      isLastInteraction &&
      interactionTokens > allowedTokenCount - tokensUsed
    ) {
      const availableTokens = allowedTokenCount - tokensUsed;
      interaction = progressivelyPruneInteraction(interaction, availableTokens);
    }

    const finalInteractionTokens = getInteractionTokenCount(interaction);
    if (tokensUsed + finalInteractionTokens <= allowedTokenCount) {
      tokensUsed += finalInteractionTokens;
      selected.unshift(...interaction.messages);
    } else {
      break;
    }
  }

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
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
      },
      "Render Conversation V2: No interactions fit in context window."
    );
    return new Err(
      new Error("Context window exceeded: at least one message is required")
    );
  }

  // Remove tokenCount from final messages
  const finalMessages: ModelMessageTypeMultiActions[] = selected.map(
    ({ tokenCount: _tokenCount, ...msg }) => msg
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
