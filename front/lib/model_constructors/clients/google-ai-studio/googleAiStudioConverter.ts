import {
  type GoogleAiStudio,
  UnsupportedImageMimeTypeError,
} from "@app/lib/model_constructors/clients/google-ai-studio/googleAiStudioClient";
import type {
  OutputFormat,
  ToolSpecification,
} from "@app/lib/model_constructors/types/config";
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
} from "@app/lib/model_constructors/types/events";
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
} from "@app/lib/model_constructors/types/messages";
// biome-ignore lint/plugin/noAppImportsInModels: monorepo-global utility with no domain meaning
import { assertNever } from "@app/types/shared/utils/assert_never";
// biome-ignore lint/plugin/noAppImportsInModels: monorepo-global utility with no domain meaning
import { trustedFetchImageBase64 } from "@app/types/shared/utils/image_utils";
import type {
  Content,
  FunctionDeclaration,
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
  Part,
  SchemaUnion,
  ThinkingConfig,
  Tool,
  ToolConfig,
} from "@google/genai";
import {
  FinishReason,
  FunctionCallingConfigMode,
  ThinkingLevel,
} from "@google/genai";
import { randomUUID } from "crypto";
import type { z } from "zod";

type Constructor<T> = abstract new (...args: any[]) => T;

const GOOGLE_AI_STUDIO_SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

function isFunctionResponseContent(content: Content): boolean {
  const parts = content.parts ?? [];
  return (
    content.role === "user" &&
    parts.length > 0 &&
    parts.every((part) => part.functionResponse !== undefined)
  );
}

export function WithGoogleAiStudioConverter<
  T extends Constructor<GoogleAiStudio>,
>(Base: T) {
  abstract class WithConverter extends Base {
    // -- Input converter: leaf methods --

    outputFormatToResponseSchema(outputFormat: OutputFormat): {
      responseMimeType: string;
      responseSchema: SchemaUnion;
    } {
      return {
        responseMimeType: "application/json",
        responseSchema: outputFormat.json_schema.schema,
      };
    }

    toolSpecToFunctionDeclaration(
      tool: ToolSpecification
    ): FunctionDeclaration {
      return {
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: { type: "object", ...tool.inputSchema },
      };
    }

    toolSpecsToTools(tools: ToolSpecification[]): Tool[] {
      if (tools.length === 0) {
        return [];
      }
      return [
        {
          functionDeclarations: tools.map((t) =>
            this.toolSpecToFunctionDeclaration(t)
          ),
        },
      ];
    }

    forceToolNameToToolConfig(
      tools?: ToolSpecification[],
      forceTool?: string
    ): ToolConfig | undefined {
      return forceTool && tools?.some((t) => t.name === forceTool)
        ? {
            functionCallingConfig: {
              allowedFunctionNames: [forceTool],
              mode: FunctionCallingConfigMode.ANY,
            },
          }
        : undefined;
    }

    reasoningToThinkingConfig(
      reasoning: NonNullable<z.infer<typeof this.configSchema>["reasoning"]>
    ): ThinkingConfig {
      switch (reasoning.effort) {
        case "none":
          // Gemini 3+ models do not allow disabling thinking entirely;
          // use the minimum supported budget.
          throw new Error(
            `Reasoning effort "none" is not supported by Google AI Studio`
          );
        case "minimal":
          return {
            thinkingLevel: ThinkingLevel.MINIMAL,
            includeThoughts: true,
          };
        case "low":
          return { thinkingLevel: ThinkingLevel.LOW, includeThoughts: true };
        case "medium":
          return { thinkingLevel: ThinkingLevel.MEDIUM, includeThoughts: true };
        case "high":
          return { thinkingLevel: ThinkingLevel.HIGH, includeThoughts: true };
        default:
          assertNever(reasoning.effort);
      }
    }

    systemMessagesToSystemInstruction(
      system: SystemTextMessage[]
    ): Content | undefined {
      if (system.length === 0) {
        return undefined;
      }
      return {
        parts: system.map((message) => ({ text: message.content.value })),
      };
    }

    userTextMessageToPart(message: BaseUserTextMessage): Part {
      return { text: message.content.value };
    }

    async userImageMessageToPart(message: BaseUserImageMessage): Promise<Part> {
      let fetchResult: Awaited<ReturnType<typeof trustedFetchImageBase64>>;
      try {
        fetchResult = await trustedFetchImageBase64(message.content.url);
      } catch {
        // Don't kill the whole turn when one image fails to load; degrade to
        // a text placeholder so the rest of the conversation continues.
        return { text: "Attachment: image could not be loaded." };
      }

      const { mediaType, data } = fetchResult;

      if (!GOOGLE_AI_STUDIO_SUPPORTED_MIME_TYPES.includes(mediaType)) {
        throw new UnsupportedImageMimeTypeError(mediaType);
      }

      return { inlineData: { mimeType: mediaType, data } };
    }

    async toolCallResultMessageToParts(
      message: BaseToolCallResultMessage,
      callIdToName: Map<string, string>
    ): Promise<Part[]> {
      const name = callIdToName.get(message.content.callId) ?? "";
      const id = message.content.callId;

      const parts: Part[] = [];
      for (const part of message.content.parts) {
        if (part.type === "text") {
          parts.push({
            functionResponse: { id, name, response: { output: part.text } },
          });
          continue;
        }

        let fetchResult: Awaited<ReturnType<typeof trustedFetchImageBase64>>;
        try {
          fetchResult = await trustedFetchImageBase64(part.url);
        } catch {
          // Same degradation as user-message images: don't kill the turn on
          // a single failed image, surface a text placeholder instead.
          parts.push({
            functionResponse: {
              id,
              name,
              response: { output: "Attachment: image could not be loaded." },
            },
          });
          continue;
        }

        if (
          !GOOGLE_AI_STUDIO_SUPPORTED_MIME_TYPES.includes(fetchResult.mediaType)
        ) {
          throw new UnsupportedImageMimeTypeError(fetchResult.mediaType);
        }

        parts.push({
          functionResponse: {
            id,
            name,
            parts: [
              {
                inlineData: {
                  mimeType: fetchResult.mediaType,
                  data: fetchResult.data,
                },
              },
            ],
          },
        });
      }
      return parts;
    }

    assistantTextMessageToPart(message: BaseAssistantTextMessage): Part {
      return { text: message.content.value };
    }

    assistantReasoningMessageToPart(
      message: BaseAssistantReasoningMessage
    ): Part {
      return {
        text: message.content.value,
        thought: true,
        thoughtSignature: message.signature,
      };
    }

    assistantToolCallRequestToPart(
      message: BaseAssistantToolCallRequestMessage
    ): Part {
      let parsedArgs: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(message.content.arguments);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          parsedArgs = parsed as Record<string, unknown>;
        }
      } catch {
        // leave parsedArgs as {}
      }
      return {
        functionCall: {
          id: message.content.callId,
          name: message.content.toolName,
          args: parsedArgs,
        },
        thoughtSignature: message.signature,
      };
    }

    // -- Input converter: composite methods --

    async userMessageToContent(
      message: BaseUserMessage,
      callIdToName: Map<string, string>
    ): Promise<Content> {
      switch (message.type) {
        case "text":
          return { role: "user", parts: [this.userTextMessageToPart(message)] };
        case "image_url":
          return {
            role: "user",
            parts: [await this.userImageMessageToPart(message)],
          };
        case "tool_call_result":
          return {
            role: "user",
            parts: await this.toolCallResultMessageToParts(
              message,
              callIdToName
            ),
          };
        default:
          assertNever(message);
      }
    }

    assistantMessageToContent(message: BaseAssistantMessage): Content {
      switch (message.type) {
        case "text":
          return {
            role: "model",
            parts: [this.assistantTextMessageToPart(message)],
          };
        case "reasoning":
          return {
            role: "model",
            parts: [this.assistantReasoningMessageToPart(message)],
          };
        case "tool_call_request":
          return {
            role: "model",
            parts: [this.assistantToolCallRequestToPart(message)],
          };
        default:
          assertNever(message);
      }
    }

    async conversationToContents(
      conversation: BaseConversation
    ): Promise<Content[]> {
      // Track callId → toolName to satisfy Google's requirement that
      // functionResponse parts carry the name of the function they answer.
      const callIdToName = new Map<string, string>();
      const contents: Content[] = [];

      for (const message of conversation.messages) {
        let content: Content;
        switch (message.role) {
          case "user":
            content = await this.userMessageToContent(message, callIdToName);
            break;
          case "assistant":
            if (message.type === "tool_call_request") {
              callIdToName.set(
                message.content.callId,
                message.content.toolName
              );
            }
            content = this.assistantMessageToContent(message);
            break;
          default:
            assertNever(message);
        }

        // Merge consecutive function-response Contents into one user turn:
        // Gemini requires the functionResponse part count to match the
        // functionCall count of the preceding model turn.
        const previous = contents[contents.length - 1];
        if (
          previous &&
          isFunctionResponseContent(previous) &&
          isFunctionResponseContent(content)
        ) {
          contents[contents.length - 1] = {
            ...previous,
            parts: [...(previous.parts ?? []), ...(content.parts ?? [])],
          };
        } else {
          contents.push(content);
        }
      }

      return contents;
    }

    // -- Output converter: leaf methods --

    responseIdToResponseIdEvent(responseId: string): ResponseIdEvent {
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

    functionCallPartToToolCallEvent(part: Part): ToolCallEvent | null {
      const fnCall = part.functionCall;
      if (!fnCall || !fnCall.name) {
        return null;
      }
      return {
        type: "tool_call",
        content: {
          // Google does not always return an id; generate a stable one so the
          // call can be correlated with its functionResponse later.
          id: fnCall.id ?? `fc_${randomUUID()}`,
          name: fnCall.name,
          arguments: fnCall.args ?? {},
        },
        metadata: {
          ...this.model,
          ...(part.thoughtSignature
            ? { content: { signature: part.thoughtSignature } }
            : {}),
        },
      };
    }

    usageToTokenUsageEvent(
      usage: GenerateContentResponseUsageMetadata | undefined
    ): TokenUsageEvent {
      // Google reports prompt tokens (cached + uncached). cachedContentTokenCount
      // is the portion already in cache.
      const cacheHit = usage?.cachedContentTokenCount ?? 0;
      const promptTokens = usage?.promptTokenCount ?? 0;
      const toolUseInputTokens = usage?.toolUsePromptTokenCount ?? 0;
      const standardInput =
        Math.max(promptTokens - cacheHit, 0) + toolUseInputTokens;
      const reasoning = usage?.thoughtsTokenCount ?? 0;
      const candidates = usage?.candidatesTokenCount ?? 0;

      return {
        type: "token_usage",
        content: {
          cacheCreated: 0, // Not reported by Google AI Studio.
          cacheHit,
          standardInput,
          standardOutput: candidates,
          reasoning,
        },
        metadata: this.model,
      };
    }

    finishReasonToErrorEvent(reason: FinishReason): ErrorEvent | null {
      switch (reason) {
        case FinishReason.STOP:
          return null;
        case FinishReason.MAX_TOKENS:
          return {
            type: "error",
            content: {
              type: "stop_error",
              message: "The maximum response length was reached.",
            },
            metadata: this.model,
          };
        case FinishReason.SAFETY:
        case FinishReason.RECITATION:
        case FinishReason.PROHIBITED_CONTENT:
        case FinishReason.SPII:
        case FinishReason.IMAGE_PROHIBITED_CONTENT:
        case FinishReason.IMAGE_RECITATION:
        case FinishReason.BLOCKLIST:
        case FinishReason.IMAGE_SAFETY:
        case FinishReason.LANGUAGE:
          return {
            type: "error",
            content: {
              type: "refusal_error",
              message:
                "Google safety filters prevented this response. Try starting a new conversation or rephrasing your request.",
            },
            metadata: this.model,
          };
        case FinishReason.MALFORMED_FUNCTION_CALL:
        case FinishReason.UNEXPECTED_TOOL_CALL:
          return {
            type: "error",
            content: {
              type: "server_error",
              message: `Tool call error from Google: ${reason}`,
            },
            metadata: this.model,
          };
        case FinishReason.NO_IMAGE:
        case FinishReason.IMAGE_OTHER:
        case FinishReason.OTHER:
        case FinishReason.FINISH_REASON_UNSPECIFIED:
          return {
            type: "error",
            content: {
              type: "unknown_error",
              message: `Unknown stop reason from Google: ${reason}`,
            },
            metadata: this.model,
          };
        default:
          assertNever(reason);
      }
    }

    // -- Output converter: rawOutputToEvents --

    async *rawOutputToEvents(
      stream: AsyncGenerator<GenerateContentResponse>
    ): AsyncGenerator<LargeLanguageModelResponseEvent> {
      const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];

      let textAccumulator = "";
      let reasoningAccumulator = "";
      let pendingSignature: string | undefined = undefined;
      let hasYieldedResponseId = false;
      let lastUsage: GenerateContentResponseUsageMetadata | undefined;
      let pendingError: ErrorEvent | null = null;

      const flushText = (): TextEvent | null => {
        if (!textAccumulator) {
          return null;
        }
        const event = this.accumulatedTextToTextEvent(textAccumulator);
        textAccumulator = "";
        return event;
      };

      const flushReasoning = (): ReasoningEvent | null => {
        if (!reasoningAccumulator) {
          return null;
        }
        const event = this.accumulatedReasoningToReasoningEvent(
          reasoningAccumulator,
          pendingSignature
        );
        reasoningAccumulator = "";
        pendingSignature = undefined;
        return event;
      };

      for await (const response of stream) {
        if (!hasYieldedResponseId && response.responseId) {
          yield this.responseIdToResponseIdEvent(response.responseId);
          hasYieldedResponseId = true;
        }

        if (response.usageMetadata) {
          lastUsage = response.usageMetadata;
        }

        const candidate = response.candidates?.[0];
        if (!candidate) {
          continue;
        }

        const parts = candidate.content?.parts ?? [];
        for (const part of parts) {
          if (part.thought && part.text) {
            if (part.thoughtSignature) {
              pendingSignature = part.thoughtSignature;
            }
            reasoningAccumulator += part.text;
            yield this.reasoningDeltaToReasoningDeltaEvent(part.text);
            continue;
          }

          if (part.functionCall) {
            const reasoningEvent = flushReasoning();
            if (reasoningEvent) {
              aggregated.push(reasoningEvent);
              yield reasoningEvent;
            }
            const textEvent = flushText();
            if (textEvent) {
              aggregated.push(textEvent);
              yield textEvent;
            }
            const toolCallEvent = this.functionCallPartToToolCallEvent(part);
            if (toolCallEvent) {
              aggregated.push(toolCallEvent);
              yield toolCallEvent;
            }
            continue;
          }

          if (part.text) {
            textAccumulator += part.text;
            yield this.textDeltaToTextDeltaEvent(part.text);
          }
        }

        if (candidate.finishReason) {
          pendingError = this.finishReasonToErrorEvent(candidate.finishReason);
        }
      }

      // Flush trailing reasoning/text accumulators after the stream ends.
      const reasoningEvent = flushReasoning();
      if (reasoningEvent) {
        aggregated.push(reasoningEvent);
        yield reasoningEvent;
      }
      const textEvent = flushText();
      if (textEvent) {
        aggregated.push(textEvent);
        yield textEvent;
      }

      yield this.usageToTokenUsageEvent(lastUsage);

      if (pendingError) {
        yield pendingError;
        return;
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
