import type {
  MessageCreateParamsNonStreaming,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { Client } from "@app/lib/model_constructors/client";
import {
  assistantReasoningMessageToThinkingBlocks,
  assistantTextMessageToTextBlock,
  assistantToolCallRequestToToolUseBlock,
  conversationToMessages,
  forceToolNameToToolChoice,
  type MessageBlockConverters,
  outputFormatToOutputConfig,
  reasoningToThinkingConfig,
  systemMessagesToSystemParam,
  systemMessageToTextBlock,
  toolCallResultMessageToToolResultBlock,
  toolSpecToAnthropicTool,
  userImageMessageToImageBlock,
  userTextMessageToTextBlock,
} from "@app/lib/model_constructors/providers/anthropic/converters/input/utils";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type {
  Payload,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

/**
 * Mixin that turns our provider-agnostic conversation/config into the Anthropic
 * Messages API request shape. Apply it when defining a model endpoint:
 *
 *   class AnthropicClaudeXyz extends WithAnthropicInputConverter(ModelEndpoint) {
 *     async *streamRaw(input) { ... }
 *   }
 *
 * The leaf converters (one Anthropic block per message) are bound to pure
 * helpers as class fields, and the composite helpers route through `this`, so
 * an endpoint can override a single leaf — say `userImageMessageToImageBlock` —
 * by re-declaring its own field, without touching the rest.
 */
export function WithAnthropicInputConverter<
  TBase extends AbstractConstructor<Client>,
>(Base: TBase) {
  abstract class WithAnthropicInputConverter
    extends Base
    implements MessageBlockConverters
  {
    // -- Leaf converters: one Anthropic block per message. Bound to the pure
    //    helpers as class fields so an endpoint can override a single leaf by
    //    re-declaring its own field. --

    systemMessageToTextBlock = systemMessageToTextBlock;
    userTextMessageToTextBlock = userTextMessageToTextBlock;
    userImageMessageToImageBlock = userImageMessageToImageBlock;
    toolCallResultMessageToToolResultBlock =
      toolCallResultMessageToToolResultBlock;
    assistantTextMessageToTextBlock = assistantTextMessageToTextBlock;
    assistantReasoningMessageToThinkingBlocks =
      assistantReasoningMessageToThinkingBlocks;
    assistantToolCallRequestToToolUseBlock =
      assistantToolCallRequestToToolUseBlock;

    // -- Composites: delegate to the pure helpers, routed through `this` --

    conversationToMessages(
      conversation: Payload["conversation"]
    ): MessageParam[] {
      return conversationToMessages(conversation, this);
    }

    systemMessagesToSystemParam(system: SystemTextMessage[]): TextBlockParam[] {
      return systemMessagesToSystemParam(system, this);
    }

    // -- Entry point: build the full Anthropic request --

    buildRequestPayload(
      payload: Payload,
      config: InputConfig
    ): MessageCreateParamsNonStreaming {
      const { conversation } = payload;
      const {
        tools = [],
        temperature,
        reasoning,
        forceTool,
        outputFormat,
      } = config;

      const thinkingConfig = reasoningToThinkingConfig(reasoning);
      const outputConfig = {
        ...(outputFormat ? outputFormatToOutputConfig(outputFormat) : {}),
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
        tools: tools.map((tool) => toolSpecToAnthropicTool(tool)),
        tool_choice: forceToolNameToToolChoice(tools, forceTool),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(Object.keys(outputConfig).length > 0
          ? { output_config: outputConfig }
          : {}),
      };
    }
  }

  return WithAnthropicInputConverter;
}
