import type { Client } from "@app/lib/model_constructors/client";
import {
  assistantReasoningMessageToMessage,
  assistantTextMessageToMessage,
  assistantToolCallRequestToMessage,
  conversationToOpenAICompletionsMessages,
  forceToolNameToToolChoice,
  type OpenAICompletionsMessageConverters,
  outputFormatToResponseFormat,
  systemMessageToMessage,
  toolCallResultMessageToMessage,
  toReasoningEffortParam,
  toTool,
  userImageMessageToMessage,
  userTextMessageToMessage,
} from "@app/lib/model_constructors/sdk/openai_completions/converters/input/utils";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Turns our provider-agnostic conversation/config into the OpenAI
// `chat.completions.create` request shape. Leaf converters are bound as class
// fields and the composite routes through `this`, so an endpoint can override a
// single leaf.
export function WithOpenAICompletionsInputConverter<
  TBase extends AbstractConstructor<Client<InputConfig>>,
>(Base: TBase) {
  abstract class WithOpenAICompletionsInputConverter
    extends Base
    implements OpenAICompletionsMessageConverters
  {
    systemMessageToMessage = systemMessageToMessage;
    userTextMessageToMessage = userTextMessageToMessage;
    userImageMessageToMessage = userImageMessageToMessage;
    toolCallResultMessageToMessage = toolCallResultMessageToMessage;
    assistantTextMessageToMessage = assistantTextMessageToMessage;
    assistantReasoningMessageToMessage = assistantReasoningMessageToMessage;
    assistantToolCallRequestToMessage = assistantToolCallRequestToMessage;

    buildRequestPayload(
      payload: Payload,
      config: InputConfig
    ): ChatCompletionCreateParamsNonStreaming {
      const { conversation } = payload;
      const {
        tools = [],
        temperature,
        reasoning,
        forceTool,
        outputFormat,
      } = config;

      const reasoningEffort = reasoning
        ? toReasoningEffortParam(reasoning.effort)
        : undefined;

      // `tool_choice` is always sent (matching the legacy client); `tools` is
      // only sent when non-empty. No explicit max-output cap is sent, matching
      // the legacy client.
      return {
        model: this.constructor.modelId,
        messages: conversationToOpenAICompletionsMessages(conversation, this),
        temperature,
        tool_choice: forceToolNameToToolChoice(tools, forceTool),
        ...(tools.length > 0 ? { tools: tools.map(toTool) } : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        ...(outputFormat
          ? { response_format: outputFormatToResponseFormat(outputFormat) }
          : {}),
      };
    }
  }

  return WithOpenAICompletionsInputConverter;
}
