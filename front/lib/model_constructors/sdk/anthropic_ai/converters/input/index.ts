import type {
  MessageCreateParamsNonStreaming,
  MessageParam,
  Model,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { Client } from "@app/lib/model_constructors/client";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import {
  includesToolSearchTool,
  TOOL_SEARCH_INSTRUCTION,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import {
  assistantReasoningMessageToThinkingBlocks,
  assistantTextMessageToTextBlock,
  assistantToolCallRequestToToolUseBlock,
  conversationToMessages,
  forceToolNameToToolChoice,
  imageUrlToImageBlock,
  type MessageBlockConverters,
  outputFormatToOutputConfig,
  reasoningToThinkingConfig,
  systemMessagesToSystemParam,
  systemMessageToTextBlock,
  toolSpecsToAnthropicAITools,
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
    imageUrlToImageBlock: MessageBlockConverters["imageUrlToImageBlock"] =
      imageUrlToImageBlock;
    assistantTextMessageToTextBlock = assistantTextMessageToTextBlock;
    assistantReasoningMessageToThinkingBlocks =
      assistantReasoningMessageToThinkingBlocks;
    assistantToolCallRequestToToolUseBlock =
      assistantToolCallRequestToToolUseBlock;
    reasoningToThinkingConfig = reasoningToThinkingConfig;
    modelIdToApiModelId = (modelId: ModelId): Model => modelId;

    conversationToMessages(
      conversation: Payload["conversation"]
    ): Promise<MessageParam[]> {
      return conversationToMessages(conversation, this);
    }

    systemMessagesToSystemParam(system: SystemTextMessage[]): TextBlockParam[] {
      return systemMessagesToSystemParam(system, this);
    }

    async buildRequestPayload(
      payload: Payload,
      config: AnthropicInputConfig
    ): Promise<MessageCreateParamsNonStreaming> {
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

      // Build the tools first so the prompt reflects what is actually sent: the
      // tool search instruction is appended only when the search tool is in the
      // request, as a trailing block outside the cached system prefix.
      const anthropicTools = toolSpecsToAnthropicAITools(tools, { forceTool });
      const system = this.systemMessagesToSystemParam(conversation.system);

      return {
        model: this.modelIdToApiModelId(this.constructor.modelId),
        max_tokens: this.constructor.maxOutputTokens,
        messages: await this.conversationToMessages(conversation),
        system: includesToolSearchTool(anthropicTools)
          ? [...system, { type: "text", text: TOOL_SEARCH_INSTRUCTION }]
          : system,
        thinking: thinkingConfig.thinking,
        tools: anthropicTools,
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
