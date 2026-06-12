import type {
  MessageCreateParamsNonStreaming,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { Client } from "@app/lib/model_constructors/client";
import {
  conversationToMessages,
  type MessageBlockConverters,
  userTextMessageToTextBlock,
} from "@app/lib/model_constructors/providers/anthropic/converters/input/utils";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";

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
    userTextMessageToTextBlock = userTextMessageToTextBlock;

    conversationToMessages(
      conversation: Payload["conversation"]
    ): MessageParam[] {
      return conversationToMessages(conversation, this);
    }

    buildRequestPayload(
      payload: Payload,
      config: InputConfig
    ): MessageCreateParamsNonStreaming {
      const { conversation } = payload;
      const { temperature } = config;

      return {
        model: this.constructor.modelId,
        max_tokens: this.constructor.maxOutputTokens,
        messages: this.conversationToMessages(conversation),
        ...(temperature !== undefined ? { temperature } : {}),
      };
    }
  }

  return WithAnthropicInputConverter;
}
