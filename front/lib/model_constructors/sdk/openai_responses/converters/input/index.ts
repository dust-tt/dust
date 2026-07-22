import type { Client } from "@app/lib/model_constructors/client";
import {
  assistantProviderPassthroughMessageToInputItems,
  assistantReasoningMessageToInputItems,
  assistantTextMessageToInputItem,
  assistantToolCallRequestToInputItem,
  conversationToInput,
  forceToolToToolChoice,
  type MessageItemConverters,
  outputFormatToResponseFormat,
  promptCacheBreakpointFor,
  reasoningToOpenAIResponsesReasoning,
  systemMessagesToInputItems,
  toolCallResultMessageToInputItem,
  toolSpecsToOpenAITools,
  userImageMessageToInputItem,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { toToolChoiceInput } from "@app/lib/model_constructors/types/input/configuration";
import type {
  Payload,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import type {
  ResponseCreateParamsNonStreaming,
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

    buildRequestPayload(
      payload: Payload,
      config: InputConfig
    ): ResponseCreateParamsNonStreaming {
      const { conversation } = payload;
      const {
        tools = [],
        temperature,
        reasoning,
        outputFormat,
        cacheKey,
        forceTool,
        toolSearchEnabled,
      } = config;

      const reasoningConfig = reasoningToOpenAIResponsesReasoning(reasoning);

      return {
        model: this.constructor.model,
        max_output_tokens: this.constructor.maxOutputTokens,
        ...(cacheKey ? { prompt_cache_key: cacheKey } : {}),
        // OpenAI renders tools before input messages, so the first system
        // breakpoint also closes the reusable tools prefix.
        input: [
          ...this.systemMessagesToInputItems(conversation.system),
          ...this.conversationToInput(conversation),
        ],
        ...(reasoningConfig
          ? {
              reasoning: reasoningConfig,
              include: ["reasoning.encrypted_content"],
            }
          : {}),
        tools: toolSpecsToOpenAITools(tools, {
          forceTool,
          toolSearchEnabled: toolSearchEnabled ?? false,
        }),
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
