import type {
  Model as HostModel,
  MessageCreateParamsNonStreaming,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { Client } from "@app/lib/model_constructors/client";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import {
  ANTHROPIC_NATIVE_WEB_SEARCH_INSTRUCTION,
  includesAnthropicWebSearchTool,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/native_web_search";
import { stripUnreplayableServerToolBlocks } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/server_tool_passthrough";
import {
  ANTHROPIC_TOOL_SEARCH_INSTRUCTION,
  includesToolSearchTool,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import type { MessageBlockConverters } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import {
  assistantProviderPassthroughMessageToBlocks,
  assistantReasoningMessageToThinkingBlocks,
  assistantTextMessageToTextBlock,
  assistantToolCallRequestToToolUseBlock,
  conversationToMessages,
  forceToolNameToToolChoice,
  imageUrlToImageBlock,
  outputFormatToOutputConfig,
  reasoningToThinkingConfig,
  systemMessagesToSystemParam,
  systemMessageToTextBlock,
  toolSpecsToAnthropicAITools,
  userTextMessageToTextBlock,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import { toToolChoiceInput } from "@app/lib/model_constructors/types/input/configuration";
import type {
  Payload,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import type { Model } from "@app/lib/model_constructors/types/models";

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
    assistantProviderPassthroughMessageToBlocks =
      assistantProviderPassthroughMessageToBlocks;
    reasoningToThinkingConfig = reasoningToThinkingConfig;
    modelToHostModel = (modelId: Model): HostModel => modelId;

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
        toolSearchEnabled,
        nativeWebSearchEnabled,
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
      const anthropicTools = toolSpecsToAnthropicAITools(tools, {
        forceTool,
        toolSearchEnabled: toolSearchEnabled ?? false,
        nativeWebSearchEnabled: nativeWebSearchEnabled ?? false,
      });
      const toolSearchInRequest = includesToolSearchTool(anthropicTools);
      const nativeWebSearchInRequest =
        includesAnthropicWebSearchTool(anthropicTools);

      const system = this.systemMessagesToSystemParam(conversation.system);

      const renderedMessages = await this.conversationToMessages(conversation);
      const messages = stripUnreplayableServerToolBlocks(renderedMessages, {
        toolSearchInRequest,
        nativeWebSearchInRequest,
      });

      return {
        model: this.modelToHostModel(this.constructor.model),
        max_tokens: this.constructor.maxOutputTokens,
        messages,
        system: [
          ...system,
          ...(toolSearchInRequest
            ? [
                {
                  type: "text" as const,
                  text: ANTHROPIC_TOOL_SEARCH_INSTRUCTION,
                },
              ]
            : []),
          ...(nativeWebSearchInRequest
            ? [
                {
                  type: "text" as const,
                  text: ANTHROPIC_NATIVE_WEB_SEARCH_INSTRUCTION,
                },
              ]
            : []),
        ],
        // Omit the key entirely when the config carries no thinking, so the
        // model applies its own default instead of being told "disabled".
        ...("thinking" in thinkingConfig
          ? { thinking: thinkingConfig.thinking }
          : {}),
        tools: anthropicTools,
        tool_choice: forceToolNameToToolChoice(
          tools,
          toToolChoiceInput(config)
        ),
        temperature,
        ...(Object.keys(outputConfig).length > 0
          ? { output_config: outputConfig }
          : {}),
      };
    }
  }

  return WithAnthropicAIInputConverter;
}
