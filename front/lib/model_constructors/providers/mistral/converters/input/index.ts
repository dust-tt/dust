import type { Client } from "@app/lib/model_constructors/client";
import {
  assistantReasoningMessageToMessage,
  assistantTextMessageToMessage,
  assistantToolCallRequestToMessage,
  conversationToMistralMessages,
  forceToolNameToToolChoice,
  type MistralMessageConverters,
  outputFormatToResponseFormat,
  systemMessageToMessage,
  toolCallResultMessageToMessage,
  toTool,
  userImageMessageToMessage,
  userTextMessageToMessage,
} from "@app/lib/model_constructors/providers/mistral/converters/input/utils";
import type { MistralInputConfig } from "@app/lib/model_constructors/providers/mistral/inputConfig";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type { ChatCompletionStreamRequest } from "@mistralai/mistralai/models/components";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Turns our provider-agnostic conversation/config into the Mistral
// `chat.stream` request shape. Leaf converters are bound as class fields and the
// composite routes through `this`, so an endpoint can override a single leaf.
export function WithMistralInputConverter<
  TBase extends AbstractConstructor<Client<MistralInputConfig>>,
>(Base: TBase) {
  abstract class WithMistralInputConverter
    extends Base
    implements MistralMessageConverters
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
      config: MistralInputConfig
    ): ChatCompletionStreamRequest {
      const { conversation } = payload;
      const {
        tools = [],
        temperature,
        reasoning,
        forceTool,
        outputFormat,
      } = config;

      // Mistral is not sent an explicit max-output cap (matching the legacy
      // client); it uses its own default. `reasoning_effort` is only sent when
      // the model supports it — non-reasoning models drop it in their schema.
      return {
        model: this.constructor.modelId,
        messages: conversationToMistralMessages(conversation, this),
        temperature,
        tools: tools.map(toTool),
        toolChoice: forceToolNameToToolChoice(tools, forceTool),
        ...(reasoning ? { reasoningEffort: reasoning.effort } : {}),
        ...(outputFormat
          ? { responseFormat: outputFormatToResponseFormat(outputFormat) }
          : {}),
      };
    }
  }

  return WithMistralInputConverter;
}
