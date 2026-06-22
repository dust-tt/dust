import type {
  MessageCreateParamsNonStreaming,
  MessageParam,
  Model,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { Client } from "@app/lib/model_constructors/client";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
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
  toolSpecsToAnthropicAITools,
  userImageMessageToImageBlock,
  userTextMessageToTextBlock,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import type {
  Payload,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import type { ModelId } from "@app/lib/model_constructors/types/model_ids";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Turns our provider-agnostic conversation/config into the Anthropic Messages
// API request shape. Leaf converters are bound as class fields and composites
// route through `this`, so an endpoint can override a single leaf.
export function WithAnthropicAIInputConverter<
  TBase extends AbstractConstructor<Client<AnthropicInputConfig>>,
>(Base: TBase) {
  abstract class WithAnthropicAIInputConverter
    extends Base
    implements MessageBlockConverters
  {
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
    reasoningToThinkingConfig = reasoningToThinkingConfig;
    modelIdToApiModelId = (modelId: ModelId): Model => modelId;

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
      config: AnthropicInputConfig
    ): MessageCreateParamsNonStreaming {
      const { conversation } = payload;
      const {
        tools = [],
        temperature,
        reasoning,
        forceTool,
        outputFormat,
      } = config;

      const thinkingConfig = this.reasoningToThinkingConfig(reasoning);
      const outputConfig = {
        ...(outputFormat ? outputFormatToOutputConfig(outputFormat) : {}),
        ...("output_config" in thinkingConfig
          ? thinkingConfig.output_config
          : {}),
      };

      return {
        model: this.modelIdToApiModelId(this.constructor.modelId),
        max_tokens: this.constructor.maxOutputTokens,
        messages: this.conversationToMessages(conversation),
        system: this.systemMessagesToSystemParam(conversation.system),
        thinking: thinkingConfig.thinking,
        tools: toolSpecsToAnthropicAITools(tools, { forceTool }),
        tool_choice: forceToolNameToToolChoice(tools, forceTool),
        temperature,
        ...(Object.keys(outputConfig).length > 0
          ? { output_config: outputConfig }
          : {}),
      };
    }
  }

  return WithAnthropicAIInputConverter;
}
