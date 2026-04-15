import {
  ANTHROPIC_PROVIDER_ID,
  overwriteLLMParameters,
} from "@app/lib/api/llm/clients/anthropic/types";
import { LLM } from "@app/lib/api/llm/llm";
import {
  handleGenericError,
  type LLMErrorType,
} from "@app/lib/api/llm/types/errors";
import type {
  LLMEvent,
  LLMOutputItem,
  ToolCallEvent as OldToolCallEvent,
  ReasoningGeneratedEvent,
  TextGeneratedEvent,
} from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { normalizePrompt } from "@app/lib/api/llm/types/options";
import {
  extractEncryptedContentFromMetadata,
  parseResponseFormatSchema,
} from "@app/lib/api/llm/utils";
import { getModel, type LargeLanguageModel } from "@app/lib/api/models";
import type { AnthropicModel } from "@app/lib/api/models/clients/anthropic/anthropicClient";
import type { ToolSpecification } from "@app/lib/api/models/types/config";
import type {
  ErrorType,
  LargeLanguageModelResponseEvent,
  ReasoningEvent as NewReasoningEvent,
  TextEvent as NewTextEvent,
  ToolCallEvent as NewToolCallEvent,
} from "@app/lib/api/models/types/events";
import type {
  BaseMessage,
  SystemTextMessage,
} from "@app/lib/api/models/types/messages";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentFunctionCallContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

/**
 * Maps old reasoning effort values to the new model's effort values.
 */
function mapReasoningEffort(
  effort: ReasoningEffort | null
): "none" | "low" | "medium" | "high" | "maximal" {
  switch (effort) {
    case null:
    case "none":
      return "none";
    case "light":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    default:
      assertNever(effort);
  }
}

/**
 * Converts an old-system message to new BaseMessage(s).
 */
function toBaseMessages(
  message: ModelMessageTypeMultiActionsWithoutContentFragment
): BaseMessage[] {
  switch (message.role) {
    case "user":
      return message.content.map((c): BaseMessage => {
        switch (c.type) {
          case "text":
            return { role: "user", type: "text", content: { value: c.text } };
          case "image_url":
            return {
              role: "user",
              type: "image_url",
              content: { url: c.image_url.url },
            };
          default:
            assertNever(c);
        }
      });
    case "function":
      return [
        {
          role: "user",
          type: "tool_call_result",
          content: {
            callId: message.function_call_id,
            value:
              typeof message.content === "string"
                ? message.content
                : message.content
                    .map((c) => (c.type === "text" ? c.text : ""))
                    .filter(Boolean)
                    .join("\n"),
            isError: false,
          },
        },
      ];
    case "assistant":
      return message.contents.flatMap(
        (
          c:
            | AgentTextContentType
            | AgentReasoningContentType
            | AgentFunctionCallContentType
        ): BaseMessage[] => {
          switch (c.type) {
            case "text_content":
              return [
                {
                  role: "assistant",
                  type: "text",
                  content: { value: c.value },
                },
              ];
            case "reasoning":
              if (!c.value.reasoning) {
                return [];
              }
              return [
                {
                  role: "assistant",
                  type: "reasoning",
                  content: { value: c.value.reasoning },
                  signature: extractEncryptedContentFromMetadata(
                    c.value.metadata
                  ),
                },
              ];
            case "function_call":
              return [
                {
                  role: "assistant",
                  type: "tool_call_request",
                  content: {
                    callId: c.value.id,
                    toolName: c.value.name,
                    arguments: c.value.arguments,
                  },
                },
              ];
            default:
              assertNever(c);
          }
        }
      );
    default:
      assertNever(message);
  }
}

/**
 * Converts a new model aggregated item to the old LLMOutputItem format.
 */
function convertAggregatedItem(
  item: NewTextEvent | NewReasoningEvent | NewToolCallEvent,
  metadata: LLMClientMetadata
): LLMOutputItem {
  switch (item.type) {
    case "text":
      return {
        type: "text_generated",
        content: { text: item.content.value },
        metadata,
      };
    case "reasoning":
      return {
        type: "reasoning_generated",
        content: { text: item.content.value },
        metadata: {
          ...metadata,
          ...(typeof item.metadata.content?.signature === "string"
            ? { encrypted_content: item.metadata.content.signature }
            : {}),
        },
      };
    case "tool_call":
      return {
        type: "tool_call",
        content: {
          id: item.content.id,
          name: item.content.name,
          arguments: item.content.arguments,
        },
        metadata,
      };
    default:
      assertNever(item);
  }
}

/**
 * Maps new model ErrorType to old LLMErrorType with correct retryability.
 */
function mapErrorType(errorType: ErrorType): {
  type: LLMErrorType;
  isRetryable: boolean;
} {
  switch (errorType) {
    case "input_configuration_error":
      return { type: "invalid_request_error", isRetryable: false };
    case "rate_limit_error":
      return { type: "rate_limit_error", isRetryable: true };
    case "overloaded_error":
      return { type: "overloaded_error", isRetryable: true };
    case "invalid_request_error":
      return { type: "invalid_request_error", isRetryable: false };
    case "authentication_error":
      return { type: "authentication_error", isRetryable: false };
    case "permission_error":
      return { type: "permission_error", isRetryable: false };
    case "not_found_error":
      return { type: "not_found_error", isRetryable: false };
    case "network_error":
      return { type: "network_error", isRetryable: true };
    case "timeout_error":
      return { type: "timeout_error", isRetryable: true };
    case "server_error":
      return { type: "server_error", isRetryable: true };
    case "stream_error":
      return { type: "stream_error", isRetryable: true };
    case "unknown_error":
      return { type: "unknown_error", isRetryable: false };
    default:
      assertNever(errorType);
  }
}

/**
 * Converts new model events to old LLM events.
 */
async function* convertToOldEvents(
  newEvents: AsyncGenerator<LargeLanguageModelResponseEvent>,
  metadata: LLMClientMetadata
): AsyncGenerator<LLMEvent> {
  for await (const event of newEvents) {
    switch (event.type) {
      case "response_id":
        yield {
          type: "interaction_id",
          content: { modelInteractionId: event.content.responseId },
          metadata,
        };
        break;

      case "text_delta":
        yield {
          type: "text_delta",
          content: { delta: event.content.value },
          metadata,
        };
        break;

      case "text":
        yield {
          type: "text_generated",
          content: { text: event.content.value },
          metadata,
        };
        break;

      case "reasoning_delta":
        yield {
          type: "reasoning_delta",
          content: { delta: event.content.value },
          metadata,
        };
        break;

      case "reasoning":
        yield {
          type: "reasoning_generated",
          content: { text: event.content.value },
          metadata: {
            ...metadata,
            ...(typeof event.metadata.content?.signature === "string"
              ? { encrypted_content: event.metadata.content.signature }
              : {}),
          },
        };
        break;

      case "tool_call":
        yield {
          type: "tool_call",
          content: {
            id: event.content.id,
            name: event.content.name,
            arguments: event.content.arguments,
          },
          metadata,
        };
        break;

      case "token_usage": {
        const {
          standardInput,
          standardOutput,
          cacheHit,
          cacheCreated,
          reasoning,
        } = event.content;
        const inputTokens = standardInput + cacheHit + cacheCreated;
        yield {
          type: "token_usage",
          content: {
            inputTokens,
            outputTokens: standardOutput,
            reasoningTokens: reasoning,
            totalTokens: inputTokens + standardOutput + reasoning,
            cachedTokens: cacheHit,
            cacheCreationTokens: cacheCreated,
            uncachedInputTokens: standardInput,
          },
          metadata,
        };
        break;
      }

      case "success": {
        const aggregated = event.content.aggregated.map((item) =>
          convertAggregatedItem(item, metadata)
        );
        const textGenerated = aggregated.find(
          (item): item is TextGeneratedEvent => item.type === "text_generated"
        );
        const reasoningGenerated = aggregated.find(
          (item): item is ReasoningGeneratedEvent =>
            item.type === "reasoning_generated"
        );
        const toolCalls = aggregated.filter(
          (item): item is OldToolCallEvent => item.type === "tool_call"
        );
        yield {
          type: "success",
          aggregated,
          textGenerated,
          reasoningGenerated,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          metadata,
        };
        break;
      }

      case "error": {
        const { type: errorType, isRetryable } = mapErrorType(
          event.content.type
        );
        yield new EventError(
          {
            type: errorType,
            message: event.content.message,
            isRetryable,
            originalError: event.content.originalError,
          },
          metadata
        );
        break;
      }

      default:
        assertNever(event);
    }
  }
}

/**
 * Wrapper that bridges the old LLM system with the new AnthropicClaudeSonnetFourDotSix model.
 *
 * - Extends the old LLM base class (used by the existing agent pipeline).
 * - Converts old message types to BaseMessage and delegates to the new model's buildRequestPayload.
 * - Delegates streaming and event parsing to the new model class.
 */
export class AnthropicModelLLM extends LLM {
  private model: LargeLanguageModel;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & {
      modelId: AnthropicModel["modelId"];
    }
  ) {
    // We still need to overwrite as some config sent to the models are not valid
    const params = overwriteLLMParameters(llmParameters);
    super(auth, ANTHROPIC_PROVIDER_ID, params);
    this.model = getModel(llmParameters.credentials, {
      providerId: ANTHROPIC_PROVIDER_ID,
      modelId: llmParameters.modelId,
    });
    const { ANTHROPIC_API_KEY } = llmParameters.credentials;
    assert(ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY credential is required");
  }

  protected buildStreamRequestPayload(streamParameters: LLMStreamParameters) {
    const {
      conversation,
      hasConditionalJITTools,
      prompt,
      specifications,
      forceToolCall,
    } = streamParameters;

    const baseMessages = conversation.messages.flatMap(toBaseMessages);

    const { instructions, sharedContext, ephemeralContext } =
      normalizePrompt(prompt);

    const system: SystemTextMessage[] = [];

    const instructionsText = instructions.map((s) => s.content).join("\n");
    if (instructionsText) {
      system.push({
        role: "system",
        type: "text",
        content: { value: instructionsText },
        cache: hasConditionalJITTools ? "short" : "long",
      });
    }

    const sharedText = sharedContext.map((s) => s.content).join("\n");
    if (sharedText) {
      system.push({
        role: "system",
        type: "text",
        content: { value: sharedText },
        cache: "short",
      });
    }

    const ephemeralText = ephemeralContext.map((s) => s.content).join("\n");
    if (ephemeralText) {
      system.push({
        role: "system",
        type: "text",
        content: { value: ephemeralText },
      });
    }

    return this.model.buildRequestPayload(
      { conversation: { system, messages: baseMessages } },
      this.model.configSchema.parse({
        tools: specifications as ToolSpecification[],
        temperature: this.temperature ?? undefined,
        reasoning: { effort: mapReasoningEffort(this.reasoningEffort) },
        forceTool: forceToolCall,
        outputFormat: parseResponseFormatSchema(
          this.responseFormat,
          ANTHROPIC_PROVIDER_ID
        ),
      })
    );
  }

  protected async *sendRequest(payload: unknown): AsyncGenerator<LLMEvent> {
    try {
      const rawStream = this.model.streamRaw(payload);
      const newEvents = this.model.rawOutputToEvents(rawStream);
      yield* convertToOldEvents(newEvents, this.metadata);
    } catch (err) {
      yield handleGenericError(err, this.metadata);
    }
  }
}
