import type {
  MessageCreateParamsNonStreaming,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { Client } from "@app/lib/model_constructors/client";
import {
  assistantReasoningMessageToThinkingBlocks,
  conversationToMessages,
  type MessageBlockConverters,
  reasoningToThinkingConfig,
  systemMessagesToSystemParam,
  systemMessageToTextBlock,
  userTextMessageToTextBlock,
} from "@app/lib/model_constructors/providers/anthropic/converters/input/utils";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type {
  Payload,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Turns our provider-agnostic conversation/config into the Anthropic Messages
// API request shape. Leaf converters are bound as class fields and composites
// route through `this`, so an endpoint can override a single leaf.
export function WithAnthropicInputConverter<
  TBase extends AbstractConstructor<Client>,
>(Base: TBase) {
  abstract class WithAnthropicInputConverter
    extends Base
    implements MessageBlockConverters
  {
    systemMessageToTextBlock = systemMessageToTextBlock;
    userTextMessageToTextBlock = userTextMessageToTextBlock;
    assistantReasoningMessageToThinkingBlocks =
      assistantReasoningMessageToThinkingBlocks;

    conversationToMessages(
      conversation: Payload["conversation"]
    ): MessageParam[] {
      return conversationToMessages(conversation, this);
    }

    systemMessagesToSystemParam(system: SystemTextMessage[]): TextBlockParam[] {
      return systemMessagesToSystemParam(system, this);
    }

    buildRequestPayload(
      payload: Payload,
      config: InputConfig
    ): MessageCreateParamsNonStreaming {
      const { conversation } = payload;
      const { temperature, reasoning } = config;

      const thinkingConfig = reasoningToThinkingConfig(reasoning);
      const outputConfig = {
        ...("output_config" in thinkingConfig
          ? thinkingConfig.output_config
          : {}),
      };

      return {
        model: this.constructor.modelId,
        max_tokens: this.constructor.maxOutputTokens,
        messages: this.conversationToMessages(conversation),
        system: this.systemMessagesToSystemParam(conversation.system),
        thinking: thinkingConfig.thinking,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(Object.keys(outputConfig).length > 0
          ? { output_config: outputConfig }
          : {}),
      };
    }
  }

  return WithAnthropicInputConverter;
}
