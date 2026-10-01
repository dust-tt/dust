import type { Client } from "@app/lib/model_constructors/client";
import { includesOpenAIToolSearchTool } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/tool_search";
import type {
  MessageItemConverters,
  OpenAIReasoningSummary,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import {
  assistantProviderPassthroughMessageToInputItems,
  assistantReasoningMessageToInputItems,
  assistantTextMessageToInputItem,
  assistantToolCallRequestToInputItem,
  conversationToInput,
  forceToolToToolChoice,
  outputFormatToResponseFormat,
  promptCacheBreakpointFor,
  reasoningToOpenAIResponsesReasoning,
  systemMessagesToInputItems,
  toolCallResultMessageToInputItem,
  toolNamesCalledWithoutNamespace,
  toolSpecsToOpenAITools,
  userImageMessageToInputItem,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { toToolChoiceInput } from "@app/lib/model_constructors/types/input/configuration";
import type {
  Payload,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import type { Model } from "@app/lib/model_constructors/types/models";
import { TOOL_SEARCH_INSTRUCTION } from "@app/lib/model_constructors/types/tool_search";
import type {
  ResponseCreateParams,
  ResponseInputItem,
} from "openai/resources/responses/responses";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Turns our provider-agnostic conversation/config into the OpenAI Responses API
// request shape. Leaf converters are bound as class fields and composites route
// through `this`, so an endpoint can override a single leaf.
export function WithOpenAIResponsesInputConverter<
  TBase extends AbstractConstructor<Client>,
>(Base: TBase) {
  abstract class WithOpenAIResponsesInputConverter
    extends Base
    implements MessageItemConverters
  {
    promptCacheBreakpointFor = promptCacheBreakpointFor;
    userImageMessageToInputItem = userImageMessageToInputItem;
    toolCallResultMessageToInputItem = toolCallResultMessageToInputItem;
    assistantTextMessageToInputItem = assistantTextMessageToInputItem;
    assistantReasoningMessageToInputItems =
      assistantReasoningMessageToInputItems;
    assistantToolCallRequestToInputItem = assistantToolCallRequestToInputItem;
    assistantProviderPassthroughMessageToInputItems =
      assistantProviderPassthroughMessageToInputItems;
    modelToHostModel = (modelId: Model): string => modelId;

    protected reasoningSummaryForModel(
      _model: Model,
      _conciseReasoningSummary: boolean
    ): OpenAIReasoningSummary {
      return "auto";
    }

    conversationToInput(
      conversation: Payload["conversation"]
    ): ResponseInputItem[] {
      return conversationToInput(conversation, this);
    }

    systemMessagesToInputItems(
      system: SystemTextMessage[]
    ): ResponseInputItem[] {
      return systemMessagesToInputItems(system, this);
    }

    // Returns the union (not `NonStreaming`) so streaming clients can override
    // this and add `stream` while still calling `super`.
    buildRequestPayload(
      payload: Payload,
      config: InputConfig
    ): ResponseCreateParams {
      const { conversation } = payload;
      const {
        tools = [],
        temperature,
        reasoning,
        outputFormat,
        cacheKey,
        forceTool,
        toolSearchEnabled,
        conciseReasoningSummary = false,
      } = config;

      const reasoningConfig = reasoningToOpenAIResponsesReasoning(
        reasoning,
        this.reasoningSummaryForModel(
          this.constructor.model,
          conciseReasoningSummary
        )
      );
      const openAITools = toolSpecsToOpenAITools(tools, {
        forceTool,
        toolSearchEnabled: toolSearchEnabled ?? false,
        toolNamesRequiringDefaultNamespace:
          toolNamesCalledWithoutNamespace(conversation),
      });

      return {
        model: this.modelToHostModel(this.constructor.model),
        max_output_tokens: this.constructor.maxOutputTokens,
        ...(cacheKey ? { prompt_cache_key: cacheKey } : {}),
        input: [
          ...this.systemMessagesToInputItems(conversation.system),
          ...(includesOpenAIToolSearchTool(openAITools)
            ? this.systemMessagesToInputItems([
                {
                  role: "system",
                  type: "text",
                  content: { value: TOOL_SEARCH_INSTRUCTION },
                },
              ])
            : []),
          ...this.conversationToInput(conversation),
        ],
        ...(reasoningConfig
          ? {
              reasoning: reasoningConfig,
              include: ["reasoning.encrypted_content"],
            }
          : {}),
        tools: openAITools,
        tool_choice: forceToolToToolChoice(tools, toToolChoiceInput(config)),
        ...(outputFormat
          ? { text: { format: outputFormatToResponseFormat(outputFormat) } }
          : {}),
        temperature,
      };
    }
  }

  return WithOpenAIResponsesInputConverter;
}
