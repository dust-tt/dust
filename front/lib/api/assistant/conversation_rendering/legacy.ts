/**
 * Legacy implementation of renderConversationForModel
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

import { renderAllMessages } from "./shared/message_rendering";

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

  // Compute in parallel the token count for each message and the prompt.
  const res = await tokenCountForTexts(
    [prompt, tools, ...getTextRepresentationFromMessages(messages)],
    model
  );
  if (res.isErr()) {
    return new Err(res.error);
  }

  const [promptCount, toolDefinitionsCount, ...messagesCount] = res.value;

  // Add reasoning content token count to each message.
  for (const [i, message] of messages.entries()) {
    if (message.role === "assistant") {
      for (const content of message.contents ?? []) {
        if (content.type === "reasoning") {
          messagesCount[i] += content.value.tokens ?? 0;
        }
      }
    }
  }

  // Models turns the json schema into an internal representation that is more efficient to tokenize.
  const toolDefinitionsCountAdjustmentFactor = 0.7;

  // We initialize `tokensUsed` to the prompt tokens + a bit of buffer for message rendering
  // approximations.
  const tokensMargin = 1024;
  let tokensUsed =
    promptCount +
    Math.floor(toolDefinitionsCount * toolDefinitionsCountAdjustmentFactor) +
    tokensMargin;

  // Go backward and accumulate as much as we can within allowedTokenCount.
  const selected: ModelMessageTypeMultiActions[] = [];

  // Selection loop.
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messagesCount[i];

    const currentMessage = messages[i];

    if (tokensUsed + c <= allowedTokenCount) {
      tokensUsed += c;
      selected.unshift(currentMessage);
    } else {
      break;
    }
  }

  // Merging loop: merging content fragments into the upcoming user message.
  // Eg: [CF1, CF2, UserMessage, AgentMessage] => [CF1-CF2-UserMessage, AgentMessage]
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
      // Now we remove the content fragment from the array since it was merged into the upcoming
      // user message.
      selected.splice(i, 1);
    }
  }

  while (
    selected.length > 0 &&
    // Most model providers don't support starting by a function result or agent message.
    ["assistant", "function"].includes(selected[0].role)
  ) {
    const tokenCount = messagesCount[messages.length - selected.length];
    tokensUsed -= tokenCount;
    selected.shift();
  }

  if (selected.length === 0) {
    return new Err(
      new Error("Context window exceeded: at least one message is required")
    );
  }

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      messageCount: messages.length,
      promptToken: promptCount,
      tokensUsed,
      messageSelected: selected.length,
      elapsed: Date.now() - now,
    },
    "[ASSISTANT_TRACE] renderConversationForModelMultiActions"
  );

  return new Ok({
    modelConversation: {
      messages: selected,
    },
    tokensUsed,
  });
}