import type { LargeLanguageModel } from "@app/lib/api/models/large-language-model";
import type {
  OutputFormat,
  ToolSpecification,
} from "@app/lib/api/models/types/config";
import type {
  LargeLanguageModelResponseEvent,
  ReasoningDeltaEvent,
  ReasoningEvent,
  ResponseIdEvent,
  SuccessEvent,
  TextDeltaEvent,
  TextEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/api/models/types/events";
import type {
  BaseAssistantMessage,
  BaseAssistantReasoningMessage,
  BaseAssistantTextMessage,
  BaseAssistantToolCallRequestMessage,
  BaseConversation,
  BaseToolCallResultMessage,
  BaseUserImageMessage,
  BaseUserMessage,
  BaseUserTextMessage,
  SystemTextMessage,
} from "@app/lib/api/models/types/messages";
// biome-ignore lint/plugin/noAppImportsInModels: monorepo-global utility with no domain meaning
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Reasoning as OpenaiReasoning } from "openai/resources";
import type {
  FunctionTool,
  Response,
  ResponseCreateParamsBase,
  ResponseFormatTextJSONSchemaConfig,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputContent,
  ResponseInputImage,
  ResponseInputItem,
  ResponseInputText,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseReasoningItem,
  ResponseStreamEvent,
  ResponseUsage,
  ToolChoiceFunction,
} from "openai/resources/responses/responses";
import type { z } from "zod";

type Constructor<T> = abstract new (...args: any[]) => T;

export function WithOpenAiResponsesConverter<
  T extends Constructor<
    LargeLanguageModel<ResponseCreateParamsBase, ResponseStreamEvent>
  >,
>(Base: T) {
  abstract class WithConverter extends Base {
    forceTooltoToolChoice(
      tools?: ToolSpecification[],
      forceToolCall?: string
    ): ToolChoiceFunction | "auto" {
      return forceToolCall && tools?.some((tool) => tool.name === forceToolCall)
        ? {
            type: "function" as const,
            name: forceToolCall,
          }
        : "auto";
    }

    outputFormatToResponseFormat(
      outputFormat: OutputFormat
    ): ResponseFormatTextJSONSchemaConfig {
      return {
        type: "json_schema",
        name: outputFormat.json_schema.name,
        schema: outputFormat.json_schema.schema,
        description: outputFormat.json_schema.description,
        strict: outputFormat.json_schema.strict,
      };
    }

    toReasoning(
      reasoning: NonNullable<z.infer<typeof this.configSchema>["reasoning"]>
    ): OpenaiReasoning {
      return {
        effort: reasoning.effort === "maximal" ? "xhigh" : reasoning.effort,
        summary: "auto",
      };
    }

    userTextMessageToResponseInputText(
      userTextMessage: BaseUserTextMessage
    ): ResponseInputText {
      return { type: "input_text", text: userTextMessage.content.value };
    }

    userImageMessageToResponseInputImage(
      userImageMessage: BaseUserImageMessage
    ): ResponseInputImage {
      return {
        type: "input_image",
        image_url: userImageMessage.content.url,
        detail: "auto",
      };
    }

    toolCallResultMessageToFunctionCallOutput(
      toolCallResultMessage: BaseToolCallResultMessage
    ): ResponseInputItem.FunctionCallOutput {
      return {
        type: "function_call_output",
        call_id: toolCallResultMessage.content.callId,
        output: toolCallResultMessage.content.value,
      };
    }

    assistantTextMessageToResponseOutputMessage(
      message: BaseAssistantTextMessage
    ): ResponseOutputMessage {
      // @ts-expect-error - in practice, id is not required
      return {
        role: "assistant",
        type: "message",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: message.content.value,
            annotations: [],
          },
        ],
      };
    }

    assistantReasoningMessageToResponseReasoningItem(
      message: BaseAssistantReasoningMessage
    ): ResponseReasoningItem {
      // @ts-expect-error - in practice, id is not required
      return {
        type: "reasoning",
        summary: message.content.value
          ? [{ type: "summary_text", text: message.content.value }]
          : [],
      };
    }

    assistantToolCallRequestToFunctionCall(
      message: BaseAssistantToolCallRequestMessage
    ): ResponseFunctionToolCall {
      return {
        type: "function_call",
        call_id: message.content.callId,
        name: message.content.toolName,
        arguments: message.content.arguments,
      };
    }

    systemMessageToInputMessage(
      message: SystemTextMessage
    ): ResponseInputItem.Message {
      return {
        role: "system",
        content: [{ type: "input_text", text: message.content.value }],
      };
    }

    toolToFunctionTool(tool: ToolSpecification): FunctionTool {
      return {
        type: "function",
        // If not set to false, OpenAI requires all properties to be required,
        // and all additionalProperties to be false.
        // This does not fit with many tools that enable permissive filter properties.
        strict: false,
        name: tool.name,
        description: tool.description,
        parameters: { type: "object", ...tool.inputSchema },
      };
    }

    // -- Input converter: composite methods --

    userMessageToInputContent(
      message: BaseUserTextMessage | BaseUserImageMessage
    ): ResponseInputContent {
      switch (message.type) {
        case "text":
          return this.userTextMessageToResponseInputText(message);
        case "image_url":
          return this.userImageMessageToResponseInputImage(message);
        default:
          assertNever(message);
      }
    }

    assistantMessageToInputItem(
      message: BaseAssistantMessage
    ): ResponseInputItem {
      switch (message.type) {
        case "text":
          return this.assistantTextMessageToResponseOutputMessage(message);
        case "reasoning":
          return this.assistantReasoningMessageToResponseReasoningItem(message);
        case "tool_call_request":
          return this.assistantToolCallRequestToFunctionCall(message);
        default:
          assertNever(message);
      }
    }

    userMessageToResponseInputItem(
      message: BaseUserMessage
    ): ResponseInputItem {
      switch (message.type) {
        case "text":
        case "image_url":
          return {
            role: "user",
            content: [this.userMessageToInputContent(message)],
          };
        case "tool_call_result":
          return this.toolCallResultMessageToFunctionCallOutput(message);
        default:
          assertNever(message);
      }
    }

    conversationToResponseInput(conversation: BaseConversation): ResponseInput {
      const inputs: ResponseInput = [];

      for (const systemMessage of conversation.system) {
        inputs.push(this.systemMessageToInputMessage(systemMessage));
      }

      for (const message of conversation.messages) {
        switch (message.role) {
          case "user":
            inputs.push(this.userMessageToResponseInputItem(message));
            break;
          case "assistant":
            inputs.push(this.assistantMessageToInputItem(message));
            break;
          default:
            assertNever(message);
        }
      }

      return inputs;
    }

    // -- Output converter: leaf methods --

    responseCreatedToResponseIdEvent(responseId: string): ResponseIdEvent {
      return {
        type: "response_id",
        content: { responseId },
        metadata: this.model,
      };
    }

    textDeltaToTextDeltaEvent(delta: string): TextDeltaEvent {
      return {
        type: "text_delta",
        content: { value: delta },
        metadata: this.model,
      };
    }

    reasoningDeltaToReasoningDeltaEvent(delta: string): ReasoningDeltaEvent {
      return {
        type: "reasoning_delta",
        content: { value: delta },
        metadata: this.model,
      };
    }

    outputItemToTextEvents(outputMessage: ResponseOutputMessage): TextEvent[] {
      return outputMessage.content.flatMap((content) => {
        switch (content.type) {
          case "output_text":
            return [
              {
                type: "text",
                content: { value: content.text },
                metadata: {
                  ...this.model,
                  content: {
                    itemId: outputMessage.id,
                    phase: outputMessage.phase,
                  },
                },
              },
            ];
          case "refusal":
            return [];
          default:
            return assertNever(content);
        }
      });
    }

    reasoningItemToReasoningEvent(item: ResponseReasoningItem): ReasoningEvent {
      const concatenatedSummary = item.summary
        .map((summary) => summary.text)
        .join("\n\n");
      return {
        type: "reasoning",
        content: { value: concatenatedSummary },
        metadata: {
          ...this.model,
          content: {
            encryptedContent: item.encrypted_content ?? undefined,
            itemId: item.id,
          },
        },
      };
    }

    functionCallToToolCallEvent(item: ResponseFunctionToolCall): ToolCallEvent {
      const parsedArguments = JSON.parse(item.arguments);

      return {
        type: "tool_call",
        content: {
          id: item.call_id,
          name: item.name,
          arguments: parsedArguments,
        },
        metadata: {
          ...this.model,
          content: {
            itemId: item.id,
            callId: item.call_id,
          },
        },
      };
    }

    usageToTokenUsageEvent(usage: ResponseUsage): TokenUsageEvent {
      const cachedTokens = usage.input_tokens_details?.cached_tokens ?? 0;
      const reasoningTokens =
        usage.output_tokens_details?.reasoning_tokens ?? 0;

      return {
        type: "token_usage",
        content: {
          cacheCreated: 0, // Not reported by OpenAI.
          cacheHit: cachedTokens,
          standardInput: usage.input_tokens - cachedTokens,
          standardOutput: usage.output_tokens - reasoningTokens,
          reasoning: reasoningTokens,
        },
        metadata: this.model,
      };
    }

    // -- Output converter: composite methods --

    outputItemToEvents(
      item: ResponseOutputItem
    ): LargeLanguageModelResponseEvent[] {
      switch (item.type) {
        case "message":
          return this.outputItemToTextEvents(item);
        case "function_call":
          return [this.functionCallToToolCallEvent(item)];
        case "reasoning":
          return [this.reasoningItemToReasoningEvent(item)];
        default:
          return [];
      }
    }

    responseCompletedToEvents(
      response: Response
    ): LargeLanguageModelResponseEvent[] {
      const events: LargeLanguageModelResponseEvent[] = response.output.flatMap(
        (item) => this.outputItemToEvents(item)
      );

      if (response.usage) {
        events.push(this.usageToTokenUsageEvent(response.usage));
      }

      return events;
    }

    streamEventToEvents(
      event: ResponseStreamEvent
    ): LargeLanguageModelResponseEvent[] {
      switch (event.type) {
        case "response.created":
          return [this.responseCreatedToResponseIdEvent(event.response.id)];
        case "response.output_text.delta":
          return [this.textDeltaToTextDeltaEvent(event.delta)];
        case "response.reasoning_summary_text.delta":
          return [this.reasoningDeltaToReasoningDeltaEvent(event.delta)];
        case "response.reasoning_summary_part.added":
          if (event.summary_index === 0) {
            return [];
          }
          return [this.reasoningDeltaToReasoningDeltaEvent("\n\n")];
        case "response.output_item.done":
          return this.outputItemToEvents(event.item);
        case "response.completed":
          if (event.response.usage) {
            return [this.usageToTokenUsageEvent(event.response.usage)];
          }
          return [];
        default:
          return [];
      }
    }

    async *rawOutputToEvents(
      responseStreamEvents: AsyncIterable<ResponseStreamEvent>
    ): AsyncGenerator<LargeLanguageModelResponseEvent> {
      const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];

      for await (const event of responseStreamEvents) {
        const outputEvents = this.streamEventToEvents(event);
        for (const outputEvent of outputEvents) {
          if (
            outputEvent.type === "text" ||
            outputEvent.type === "reasoning" ||
            outputEvent.type === "tool_call"
          ) {
            aggregated.push(outputEvent);
          }
          yield outputEvent;
        }
      }

      const successEvent: SuccessEvent = {
        type: "success",
        content: { aggregated },
        metadata: this.model,
      };
      yield successEvent;
    }
  }

  return WithConverter;
}
