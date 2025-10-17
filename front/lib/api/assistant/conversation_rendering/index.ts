import { renderAllMessages } from "@app/lib/api/assistant/conversation_rendering/message_rendering";
import { getTextContentFromMessage } from "@app/lib/api/assistant/utils";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import logger from "@app/logger/logger";
import type {
  ConversationType,
  MessageTypeMultiActions,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActions,
  Result,
} from "@app/types";
import {
  assertNever,
  Err,
  isContentFragmentMessageTypeModel,
  isImageContent,
  isTextContent,
  Ok,
} from "@app/types";

import type { InteractionWithTokens, MessageWithTokens } from "./pruning";
import {
  getInteractionTokenCount,
  progressivelyPruneInteraction,
  prunePreviousInteractions,
} from "./pruning";

// When previous iteractions pruning is enabled, we'll attempt to fully preserve this number of interactions.
const PREVIOUS_INTERACTIONS_TO_PRESERVE = 1;

// Fixed number of tokens assumed for image contents
const IMAGE_CONTENT_TOKEN_COUNT = 3100;

export async function renderConversationForModel(
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

  const messagesWithTokensRes = await countTokensForMessages(messages, model);
  if (messagesWithTokensRes.isErr()) {
    return messagesWithTokensRes;
  }

  const messagesWithTokens = messagesWithTokensRes.value;

  const res = await tokenCountForTexts([prompt, tools], model);
  if (res.isErr()) {
    return new Err(res.error);
  }
  const [promptCount, toolDefinitionsCount] = res.value;

  // Calculate base token usage.
  const toolDefinitionsCountAdjustmentFactor = 0.7;
  const tokensMargin = 1024;
  const baseTokens =
    promptCount +
    Math.floor(toolDefinitionsCount * toolDefinitionsCountAdjustmentFactor) +
    tokensMargin;

  const interactions = groupMessagesIntoInteractions(messagesWithTokens);
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
      return new Err(
        new Error("Context window exceeded: at least one message is required")
      );
    }
    availableTokens -= currentInteractionTokens;
  }

  let previousInteractions = interactions.slice(0, -1);

  // prune previous interactions.
  previousInteractions = prunePreviousInteractions(
    previousInteractions,
    availableTokens,
    PREVIOUS_INTERACTIONS_TO_PRESERVE
  );

  const prunedInteractions = [...previousInteractions, currentInteraction];

  // Select interactions that fit within token budget.
  const prunedMessagesWithTokens: MessageWithTokens[] = [];
  let tokensUsed = baseTokens;

  // Go backward through interactions.
  for (let i = prunedInteractions.length - 1; i >= 0; i--) {
    const interaction = prunedInteractions[i];

    const interactionTokens = getInteractionTokenCount(interaction);
    if (tokensUsed + interactionTokens <= allowedTokenCount) {
      tokensUsed += interactionTokens;
      prunedMessagesWithTokens.unshift(...interaction.messages);
    } else {
      break;
    }
  }

  const selected: (MessageTypeMultiActions & {
    tokenCount: number;
  })[] = [];

  // Merge content fragments into user messages.
  for (let i = prunedMessagesWithTokens.length - 1; i >= 0; i--) {
    const cfMessage = prunedMessagesWithTokens[i];

    if (isContentFragmentMessageTypeModel(cfMessage)) {
      const userMessage = prunedMessagesWithTokens[i + 1];
      if (!userMessage || userMessage.role !== "user") {
        logger.error(
          {
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            selected: prunedMessagesWithTokens.map((m) => ({
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
      selected.push(userMessage);
    } else {
      selected.push(cfMessage);
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
  const finalMessages: MessageTypeMultiActions[] = selected.map(
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

async function countTokensForMessages(
  messages: MessageTypeMultiActions[],
  model: ModelConfigurationType
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
    } else {
      assertNever(m);
    }

    textRepresentations.push(text);
  }

  const res = await tokenCountForTexts(textRepresentations, model);
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
