import type {
  CacheControlEphemeral,
  ImageBlockParam,
  MessageDeltaUsage,
  MessageParam,
  OutputConfig,
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
  RawMessageDeltaEvent,
  RawMessageStartEvent,
  RawMessageStreamEvent,
  TextBlockParam,
  ThinkingBlockParam,
  ThinkingConfigAdaptive,
  ThinkingConfigDisabled,
  Tool,
  ToolChoiceAuto,
  ToolChoiceTool,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { Anthropic } from "@app/lib/api/models/clients/anthropic/anthropicClient";
import type {
  OutputFormat,
  ToolSpecification,
} from "@app/lib/api/models/types/config";
import type {
  ErrorEvent,
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
  CacheOption,
  SystemTextMessage,
} from "@app/lib/api/models/types/messages";
// biome-ignore lint/plugin/noAppImportsInModels: monorepo-global utility with no domain meaning
import { assertNever } from "@app/types/shared/utils/assert_never";

import type { z } from "zod";

type Constructor<T> = abstract new (...args: any[]) => T;

type BlockState =
  | {
      index: number;
      accumulator: string;
      type: "text" | "reasoning";
      signature?: string;
    }
  | {
      index: number;
      accumulator: string;
      type: "tool_use";
      toolId: string;
      toolName: string;
    };

export function WithAnthropicConverter<T extends Constructor<Anthropic>>(
  Base: T
) {
  abstract class WithConverter extends Base {
    outputFormatToOutputConfig(outputFormat: OutputFormat): {
      output_config: { format: NonNullable<OutputConfig["format"]> };
    } {
      return {
        output_config: {
          format: {
            type: "json_schema",
            schema: outputFormat.json_schema.schema,
          },
        },
      };
    }

    cacheToCacheControlEphemeral(cache: CacheOption): {
      cache_control: CacheControlEphemeral;
    } {
      switch (cache) {
        case "short":
          return { cache_control: { type: "ephemeral", ttl: "5m" } };
        case "long":
          return { cache_control: { type: "ephemeral", ttl: "1h" } };
        default:
          assertNever(cache);
      }
    }

    systemMessageToTextBlock(message: SystemTextMessage): TextBlockParam {
      return {
        type: "text",
        text: message.content.value,
        ...(message.cache
          ? this.cacheToCacheControlEphemeral(message.cache)
          : {}),
      };
    }

    userTextMessageToTextBlock(message: BaseUserTextMessage): TextBlockParam {
      return {
        type: "text",
        text: message.content.value,
        ...(message.cache
          ? this.cacheToCacheControlEphemeral(message.cache)
          : {}),
      };
    }

    userImageMessageToImageBlock(
      message: BaseUserImageMessage
    ): ImageBlockParam {
      return {
        type: "image",
        source: { type: "url", url: message.content.url },
        ...(message.cache
          ? this.cacheToCacheControlEphemeral(message.cache)
          : {}),
      };
    }

    assistantTextMessageToTextBlock(
      message: BaseAssistantTextMessage
    ): TextBlockParam {
      return { type: "text", text: message.content.value };
    }

    assistantReasoningMessageToThinkingBlocks(
      message: BaseAssistantReasoningMessage
    ): ThinkingBlockParam[] {
      if (!message.signature) {
        return [];
      }
      return [
        {
          type: "thinking",
          thinking: message.content.value,
          signature: message.signature,
        },
      ];
    }

    assistantToolCallRequestToToolUseBlock(
      message: BaseAssistantToolCallRequestMessage
    ): ToolUseBlockParam {
      let parsedInput: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(message.content.arguments);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          parsedInput = parsed as Record<string, unknown>;
        }
      } catch {
        // leave parsedInput as {}
      }
      return {
        type: "tool_use",
        id: message.content.callId,
        name: message.content.toolName,
        input: parsedInput,
      };
    }

    toolCallResultMessageToToolResultBlock(
      message: BaseToolCallResultMessage
    ): ToolResultBlockParam {
      return {
        type: "tool_result",
        tool_use_id: message.content.callId,
        content: message.content.value,
        ...(message.content.isError ? { is_error: true as const } : {}),
        ...(message.cache
          ? this.cacheToCacheControlEphemeral(message.cache)
          : {}),
      };
    }

    toolSpecToAnthropicTool(tool: ToolSpecification): Tool {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: { type: "object", ...tool.inputSchema },
      };
    }

    forceToolNameToToolChoice(
      tools?: ToolSpecification[],
      forceTool?: string
    ): ToolChoiceAuto | ToolChoiceTool {
      return forceTool && tools?.some((t) => t.name === forceTool)
        ? { type: "tool" as const, name: forceTool }
        : { type: "auto" as const };
    }

    reasoningToThinkingConfig(
      reasoning: NonNullable<z.infer<typeof this.configSchema>["reasoning"]>
    ):
      | {
          output_config: { effort: NonNullable<OutputConfig["effort"]> };
          thinking: ThinkingConfigAdaptive;
        }
      | {
          thinking: ThinkingConfigDisabled;
          output_config?: never;
        } {
      if (reasoning.effort === "none") {
        return { thinking: { type: "disabled" } };
      }

      return {
        output_config: {
          effort: reasoning.effort === "maximal" ? "max" : reasoning.effort,
        },
        thinking: { type: "adaptive" },
      };
    }

    // -- Input converter: composite methods --

    userMessageToContentBlocks(
      message: BaseUserMessage
    ): MessageParam["content"] {
      switch (message.type) {
        case "text":
          return [this.userTextMessageToTextBlock(message)];
        case "image_url":
          return [this.userImageMessageToImageBlock(message)];
        case "tool_call_result":
          return [this.toolCallResultMessageToToolResultBlock(message)];
        default:
          assertNever(message);
      }
    }

    assistantMessageToContentBlocks(
      message: BaseAssistantMessage
    ): MessageParam["content"] {
      switch (message.type) {
        case "text":
          return [this.assistantTextMessageToTextBlock(message)];
        case "reasoning":
          return this.assistantReasoningMessageToThinkingBlocks(message);
        case "tool_call_request":
          return [this.assistantToolCallRequestToToolUseBlock(message)];
        default:
          assertNever(message);
      }
    }

    systemMessagesToSystemParam(system: SystemTextMessage[]): TextBlockParam[] {
      return system.map((msg) => this.systemMessageToTextBlock(msg));
    }

    conversationToMessages(conversation: BaseConversation): MessageParam[] {
      const messages: MessageParam[] = [];

      for (const message of conversation.messages) {
        switch (message.role) {
          case "user":
            messages.push({
              role: "user",
              content: this.userMessageToContentBlocks(message),
            });
            break;
          case "assistant":
            messages.push({
              role: "assistant",
              content: this.assistantMessageToContentBlocks(message),
            });
            break;
          default:
            assertNever(message);
        }
      }

      return messages;
    }

    // -- Output converter: leaf methods --

    messageStartToResponseIdEvent(
      event: RawMessageStartEvent
    ): ResponseIdEvent {
      return {
        type: "response_id",
        content: { responseId: event.message.id },
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

    accumulatedTextToTextEvent(text: string): TextEvent {
      return {
        type: "text",
        content: { value: text },
        metadata: this.model,
      };
    }

    accumulatedReasoningToReasoningEvent(
      text: string,
      signature?: string
    ): ReasoningEvent {
      return {
        type: "reasoning",
        content: { value: text },
        metadata: {
          ...this.model,
          ...(signature ? { content: { signature } } : {}),
        },
      };
    }

    accumulatedToolCallToToolCallEvent(
      id: string,
      name: string,
      argumentsJson: string
    ): ToolCallEvent {
      let parsedArguments: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(argumentsJson);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          parsedArguments = parsed as Record<string, unknown>;
        }
      } catch {
        // leave parsedArguments as {}
      }
      return {
        type: "tool_call",
        content: { id, name, arguments: parsedArguments },
        metadata: this.model,
      };
    }

    messageDeltaUsageToTokenUsageEvent(
      usage: MessageDeltaUsage
    ): TokenUsageEvent {
      const cacheCreated = usage.cache_creation_input_tokens ?? 0;
      const cacheHit = usage.cache_read_input_tokens ?? 0;
      const uncachedInput = usage.input_tokens ?? 0;

      return {
        type: "token_usage",
        content: {
          cacheCreated,
          cacheHit,
          standardInput: uncachedInput,
          standardOutput: usage.output_tokens,
          reasoning: 0,
        },
        metadata: this.model,
      };
    }

    stopReasonToErrorEvent(stopReason: string): ErrorEvent | null {
      switch (stopReason) {
        case "max_tokens":
          return {
            type: "error",
            content: {
              type: "stream",
              message: `Stop reason: ${stopReason}`,
            },
            metadata: this.model,
          };
        case "refusal":
          return {
            type: "error",
            content: {
              type: "stream",
              message:
                "Claude safety filters prevented this response. Try starting a new conversation or rephrasing your request.",
            },
            metadata: this.model,
          };
        default:
          return null;
      }
    }

    // -- Output converter: composite state machine --

    contentBlockStartToEvents(
      event: RawContentBlockStartEvent,
      state: { current: BlockState | null }
    ): LargeLanguageModelResponseEvent[] {
      const block = event.content_block;
      switch (block.type) {
        case "text":
          state.current = {
            index: event.index,
            accumulator: "",
            type: "text",
          };
          return [];
        case "thinking":
          state.current = {
            index: event.index,
            accumulator: "",
            type: "reasoning",
          };
          return [];
        case "tool_use":
          state.current = {
            index: event.index,
            accumulator: "",
            type: "tool_use",
            toolId: block.id,
            toolName: block.name,
          };
          return [];
        case "redacted_thinking":
        case "server_tool_use":
        case "web_search_tool_result":
          return [];
        default:
          return [];
      }
    }

    contentBlockDeltaToEvents(
      event: RawContentBlockDeltaEvent,
      state: { current: BlockState | null }
    ): LargeLanguageModelResponseEvent[] {
      if (state.current === null) {
        return [];
      }
      const delta = event.delta;
      switch (delta.type) {
        case "text_delta":
          state.current.accumulator += delta.text;
          return [this.textDeltaToTextDeltaEvent(delta.text)];
        case "thinking_delta":
          state.current.accumulator += delta.thinking;
          return [this.reasoningDeltaToReasoningDeltaEvent(delta.thinking)];
        case "input_json_delta":
          state.current.accumulator += delta.partial_json;
          return [];
        case "signature_delta":
          if (state.current.type === "reasoning") {
            state.current.signature = delta.signature;
          }
          return [];
        case "citations_delta":
          return [];
        default:
          assertNever(delta);
      }
    }

    contentBlockStopToEvents(
      _event: RawContentBlockStopEvent,
      state: { current: BlockState | null }
    ): LargeLanguageModelResponseEvent[] {
      if (state.current === null) {
        return [];
      }
      const block = state.current;
      state.current = null;
      switch (block.type) {
        case "text":
          return [this.accumulatedTextToTextEvent(block.accumulator)];
        case "reasoning":
          return [
            this.accumulatedReasoningToReasoningEvent(
              block.accumulator,
              block.signature || undefined
            ),
          ];
        case "tool_use":
          return [
            this.accumulatedToolCallToToolCallEvent(
              block.toolId,
              block.toolName,
              block.accumulator
            ),
          ];
        default:
          assertNever(block);
      }
    }

    messageDeltaToEvents(
      event: RawMessageDeltaEvent,
      tokenUsage: { usage: MessageDeltaUsage | null }
    ): LargeLanguageModelResponseEvent[] {
      tokenUsage.usage = event.usage;
      const stopReason = event.delta.stop_reason;
      if (stopReason) {
        const errorEvent = this.stopReasonToErrorEvent(stopReason);
        if (errorEvent) {
          return [errorEvent];
        }
      }
      return [];
    }

    // -- Output converter: rawOutputToEvents --

    async *rawOutputToEvents(
      stream: AsyncGenerator<RawMessageStreamEvent>
    ): AsyncGenerator<LargeLanguageModelResponseEvent> {
      const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
      const blockState: { current: BlockState | null } = { current: null };
      const tokenUsageState: { usage: MessageDeltaUsage | null } = {
        usage: null,
      };

      for await (const event of stream) {
        let outputEvents: LargeLanguageModelResponseEvent[];

        switch (event.type) {
          case "message_start":
            outputEvents = [this.messageStartToResponseIdEvent(event)];
            break;
          case "message_stop":
            outputEvents = [];
            break;
          case "content_block_start":
            outputEvents = this.contentBlockStartToEvents(event, blockState);
            break;
          case "content_block_delta":
            outputEvents = this.contentBlockDeltaToEvents(event, blockState);
            break;
          case "content_block_stop":
            outputEvents = this.contentBlockStopToEvents(event, blockState);
            break;
          case "message_delta":
            outputEvents = this.messageDeltaToEvents(event, tokenUsageState);
            break;
          default:
            assertNever(event);
        }

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

      if (tokenUsageState.usage !== null) {
        yield this.messageDeltaUsageToTokenUsageEvent(tokenUsageState.usage);
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
