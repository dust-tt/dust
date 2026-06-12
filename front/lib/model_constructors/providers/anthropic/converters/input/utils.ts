import type {
  CacheControlEphemeral,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type {
  BaseConversation,
  BaseUserMessage,
  BaseUserTextMessage,
  CacheOption,
} from "@app/lib/model_constructors/types/input/messages";
import { assertNever } from "@app/types/shared/utils/assert_never";

// The per-message leaf converters. Composites below take an object satisfying
// this interface (`this`), so overriding one leaf on an endpoint changes how
// every composite uses it.
export interface MessageBlockConverters {
  userTextMessageToTextBlock(message: BaseUserTextMessage): TextBlockParam;
}

// -- Small, reusable building blocks --

// Spreadable fragment adding `cache_control` only when the message opts in.
export function cacheControlFor(
  cache: CacheOption | undefined
): { cache_control: CacheControlEphemeral } | Record<string, never> {
  switch (cache) {
    case "short":
      return { cache_control: { type: "ephemeral", ttl: "5m" } };
    case "long":
      return { cache_control: { type: "ephemeral", ttl: "1h" } };
    case undefined:
      return {};
    default:
      assertNever(cache);
  }
}

// -- Leaf converters: one Anthropic block per message --

export function userTextMessageToTextBlock(
  message: BaseUserTextMessage
): TextBlockParam {
  return {
    type: "text",
    text: message.content.value,
    ...cacheControlFor(message.cache),
  };
}

// -- Composite message converters (depend on the leaf converters) --

export function userMessageToContentBlocks(
  message: BaseUserMessage,
  converters: MessageBlockConverters
): MessageParam["content"] {
  switch (message.type) {
    case "text":
      return [converters.userTextMessageToTextBlock(message)];
    default:
      // Other user message types are wired in in subsequent commits.
      return [];
  }
}

export function conversationToMessages(
  conversation: BaseConversation,
  converters: MessageBlockConverters
): MessageParam[] {
  return conversation.messages.map((message) => {
    switch (message.role) {
      case "user":
        return {
          role: "user",
          content: userMessageToContentBlocks(message, converters),
        };
      case "assistant":
        // Assistant content blocks are wired in in subsequent commits.
        return { role: "assistant", content: [] };
      default:
        assertNever(message);
    }
  });
}
