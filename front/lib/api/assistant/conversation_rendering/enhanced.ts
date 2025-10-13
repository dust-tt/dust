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
  prunePreviousInteractions,
} from "./pruning";
import { renderAllMessages } from "./shared/message_rendering";

// When previous iteractions pruning is enabled, we'll attempt to fully preserve this number of interactions.
const PREVIOUS_INTERACTIONS_TO_PRESERVE = 1;

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

  // Calculate base token usage.
  const toolDefinitionsCountAdjustmentFactor = 0.7;
  const tokensMargin = 1024;
  const baseTokens =
    promptCount +
    Math.floor(toolDefinitionsCount * toolDefinitionsCountAdjustmentFactor) +
    tokensMargin;

  let currentInteraction = interactions[interactions.length - 1];
  let currentInteractionTokens = getInteractionTokenCount(currentInteraction);

  let availableTokens = allowedTokenCount - baseTokens;

  if (currentInteractionTokens > availableTokens) {
    // The last interaction does not fit within the token budget.
    // We apply progressive pruning to that interaction until it fits within the token budget.
    currentInteraction = progressivelyPruneInteraction(
      currentInteraction,
      availableTokens
    );
    currentInteractionTokens = getInteractionTokenCount(currentInteraction);
    if (currentInteractionTokens > availableTokens) {
      logger.error(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
        },
        "Render Conversation V2: No interactions fit in context window."
      );
      throw new Error(
        "Context window exceeded: at least one message is required"
      );
    }
    availableTokens -= currentInteractionTokens;
  }

  let previousInteractions = interactions.slice(0, -1);

  // If previous interactions pruning is enabled, apply it.
  if (enablePreviousInteractionsPruning) {
    previousInteractions = prunePreviousInteractions(
      previousInteractions,
      availableTokens,
      PREVIOUS_INTERACTIONS_TO_PRESERVE
    );
  }

  const prunedInteractions = [...previousInteractions, currentInteraction];

  // Select interactions that fit within token budget.
  const selected: MessageWithTokens[] = [];
  let tokensUsed = baseTokens;

  // Go backward through interactions.
  for (let i = prunedInteractions.length - 1; i >= 0; i--) {
    const interaction = prunedInteractions[i];

    const interactionTokens = getInteractionTokenCount(interaction);
    if (tokensUsed + interactionTokens <= allowedTokenCount) {
      tokensUsed += interactionTokens;
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

/**
 * Group messages into interactions (user turn + agent responses),
 * using turn type (user/content_fragment vs assistant/function) as the delimiter.
 *
 * Example: [content_fragment, user, content_fragment, user, assistant, function, function]
 * results in a single interaction.
 */
function groupMessagesIntoInteractions(
  messages: MessageWithTokens[]
): InteractionWithTokens[] {
  const interactions: InteractionWithTokens[] = [];
  let currentInteraction: MessageWithTokens[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    currentInteraction.push(message);

    //Determine the high-level turn type for a message.
    // - "user": user messages and content fragments
    // - "agent": assistant messages and tool/function results*/
    const turnTypeForMessage = (
      message: MessageWithTokens
    ): "user" | "agent" => {
      if (message.role === "user" || message.role === "content_fragment") {
        return "user";
      }
      // Includes "assistant" and "function" roles
      return "agent";
    };

    const isLastMessage = i === messages.length - 1;

    // Decide if we should close the current interaction.
    // We close when:
    // - it's the last message, or
    // - the next message is a "user" turn while the current message is an "agent" turn.
    // This ensures that all consecutive user/content_fragment messages remain in the same
    // user turn, followed by all agent/tool messages for that interaction.
    const shouldClose = (() => {
      if (isLastMessage) {
        return true;
      }
      const currentTurn = turnTypeForMessage(message);
      const nextTurn = turnTypeForMessage(messages[i + 1]);
      return currentTurn === "agent" && nextTurn === "user";
    })();

    if (shouldClose) {
      interactions.push({ messages: currentInteraction });
      currentInteraction = [];
    }
  }

  return interactions;
}
