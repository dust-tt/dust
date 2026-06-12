import type {
  CacheControlEphemeral,
  ImageBlockParam,
  MessageParam,
  OutputConfig,
  TextBlockParam,
  ThinkingBlockParam,
  ThinkingConfigAdaptive,
  ThinkingConfigDisabled,
} from "@anthropic-ai/sdk/resources/messages/messages";
import {
  type ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
  isAnthropicSupportedNonNullReasoningEffort,
} from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import type { Reasoning } from "@app/lib/model_constructors/types/input/configuration";
import type {
  BaseAssistantMessage,
  BaseAssistantReasoningMessage,
  BaseConversation,
  BaseUserImageMessage,
  BaseUserMessage,
  BaseUserTextMessage,
  CacheOption,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import { assertNever } from "@app/types/shared/utils/assert_never";

// The per-message leaf converters. Composites below take an object satisfying
// this interface (`this`), so overriding one leaf on an endpoint changes how
// every composite uses it.
export interface MessageBlockConverters {
  systemMessageToTextBlock(message: SystemTextMessage): TextBlockParam;
  userTextMessageToTextBlock(message: BaseUserTextMessage): TextBlockParam;
  userImageMessageToImageBlock(message: BaseUserImageMessage): ImageBlockParam;
  assistantReasoningMessageToThinkingBlocks(
    message: BaseAssistantReasoningMessage
  ): ThinkingBlockParam[];
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

export function systemMessageToTextBlock(
  message: SystemTextMessage
): TextBlockParam {
  return {
    type: "text",
    text: message.content.value,
    ...cacheControlFor(message.cache),
  };
}

export function userTextMessageToTextBlock(
  message: BaseUserTextMessage
): TextBlockParam {
  return {
    type: "text",
    text: message.content.value,
    ...cacheControlFor(message.cache),
  };
}

export function userImageMessageToImageBlock(
  message: BaseUserImageMessage
): ImageBlockParam {
  return {
    type: "image",
    source: { type: "url", url: message.content.url },
    ...cacheControlFor(message.cache),
  };
}

export function assistantReasoningMessageToThinkingBlocks(
  message: BaseAssistantReasoningMessage
): ThinkingBlockParam[] {
  // Anthropic rejects thinking blocks without a signature, so drop unsigned ones.
  if (!message.signature) {
    return [];
  }
  return [
    {
      type: "thinking",
      thinking: message.content.value,
      signature: message.signature,
    },
  ];
}

// -- Composite message converters (depend on the leaf converters) --

export function userMessageToContentBlocks(
  message: BaseUserMessage,
  converters: MessageBlockConverters
): MessageParam["content"] {
  switch (message.type) {
    case "text":
      return [converters.userTextMessageToTextBlock(message)];
    case "image_url":
      return [converters.userImageMessageToImageBlock(message)];
    default:
      // Other user message types are wired in in subsequent commits.
      return [];
  }
}

export function assistantMessageToContentBlocks(
  message: BaseAssistantMessage,
  converters: MessageBlockConverters
): MessageParam["content"] {
  switch (message.type) {
    case "reasoning":
      return converters.assistantReasoningMessageToThinkingBlocks(message);
    default:
      // Other assistant message types are wired in in subsequent commits.
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
        return {
          role: "assistant",
          content: assistantMessageToContentBlocks(message, converters),
        };
      default:
        assertNever(message);
    }
  });
}

export function systemMessagesToSystemParam(
  system: SystemTextMessage[],
  converters: MessageBlockConverters
): TextBlockParam[] {
  return system.map((message) => converters.systemMessageToTextBlock(message));
}

// -- Config converters (pure) --

function effortToAnthropicEffort(
  effort: (typeof ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS)[number]
): NonNullable<OutputConfig["effort"]> {
  switch (effort) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "maximal":
      return "max";
    default:
      assertNever(effort);
  }
}

export function reasoningToThinkingConfig(reasoning: Reasoning | undefined):
  | {
      output_config: { effort: NonNullable<OutputConfig["effort"]> };
      thinking: ThinkingConfigAdaptive;
    }
  | {
      thinking: ThinkingConfigDisabled;
    } {
  if (
    !reasoning ||
    reasoning.effort === "none" ||
    !isAnthropicSupportedNonNullReasoningEffort(reasoning.effort)
  ) {
    return { thinking: { type: "disabled" } };
  }

  return {
    output_config: { effort: effortToAnthropicEffort(reasoning.effort) },
    thinking: { type: "adaptive" },
  };
}
