import type {
  FinishReason,
  FunctionCall,
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
  Part,
} from "@google/genai";

import type {
  ErrorCompletionEvent,
  LLMEvent,
  ProviderMetadata,
  ReasoningDeltaEvent,
  TextDeltaEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/llm/types";

function textDeltaEvent(
  text: string,
  metadata: ProviderMetadata,
  appendTextAccumulator: (text: string) => void
): TextDeltaEvent {
  appendTextAccumulator(text);
  return {
    type: "text_delta",
    content: {
      delta: text,
    },
    metadata: metadata,
  };
}

function reasoningDeltaEvent(
  text: string,
  metadata: ProviderMetadata,
  appendReasoningAccumulator: (text: string) => void
): ReasoningDeltaEvent {
  appendReasoningAccumulator(text);
  return {
    type: "reasoning_delta",
    content: {
      delta: text,
    },
    metadata: metadata,
  };
}

function toolCallEvent(
  toolCall: FunctionCall,
  metadata: ProviderMetadata
): ToolCallEvent {
  return {
    type: "tool_call",
    content: {
      id: toolCall.id ?? "",
      name: toolCall.name ?? "tool",
      arguments: JSON.stringify(toolCall.args),
    },
    metadata: metadata,
  };
}

function partToEvents(
  part: Part,
  {
    metadata,
    appendTextAccumulator,
    appendReasoningAccumulator,
  }: {
    metadata: ProviderMetadata;
    appendTextAccumulator: (text: string) => void;
    appendReasoningAccumulator: (text: string) => void;
  }
): LLMEvent[] {
  const events: LLMEvent[] = [];
  if (part.functionCall) {
    events.push(toolCallEvent(part.functionCall, metadata));
  }

  if (part.text && !part.thought) {
    events.push(textDeltaEvent(part.text, metadata, appendTextAccumulator));
  }

  if (part.text && part.thought) {
    events.push(
      reasoningDeltaEvent(part.text, metadata, appendReasoningAccumulator)
    );
  }

  return events;
}

function tokenUsageEvent(
  usageMetadata: GenerateContentResponseUsageMetadata,
  metadata: ProviderMetadata
): TokenUsageEvent {
  return {
    type: "token_usage",
    content: {
      inputTokens: usageMetadata.promptTokenCount ?? 0,
      reasoningTokens: usageMetadata.thoughtsTokenCount,
      cachedTokens: usageMetadata.cachedContentTokenCount,
      outputTokens: usageMetadata.candidatesTokenCount ?? 0,
      totalTokens: usageMetadata.totalTokenCount ?? 0,
    },
    metadata: metadata,
  };
}

function successCompletionEvents(
  event: GenerateContentResponse,
  metadata: ProviderMetadata,
  getTextAccumulator: () => string,
  getReasoningAccumulator: () => string
): LLMEvent[] {
  const events: LLMEvent[] = [];
  if (event.usageMetadata) {
    events.push(tokenUsageEvent(event.usageMetadata, metadata));
  }
  events.push({
    type: "text_generated",
    content: {
      text: getTextAccumulator(),
    },
    metadata: metadata,
  });

  if (getReasoningAccumulator()) {
    events.push({
      type: "reasoning_generated",
      content: {
        text: getReasoningAccumulator(),
      },
      metadata: metadata,
    });
  }
  return events;
}

function errorCompletionEvent(
  finishReason: FinishReason,
  metadata: ProviderMetadata
): ErrorCompletionEvent {
  return {
    type: "error",
    content: {
      code: finishReason,
      message: finishReason,
    },
    metadata: metadata,
  };
}

export function toEvents({
  contentResponse,
  metadata,
  accumulatorUtils,
}: {
  contentResponse: GenerateContentResponse;
  metadata: ProviderMetadata;
  accumulatorUtils: {
    resetAccumulators: () => void;
    appendTextAccumulator: (text: string) => void;
    appendReasoningAccumulator: (text: string) => void;
    getTextAccumulator: () => string;
    getReasoningAccumulator: () => string;
    updateMetadata: (key: string, value: unknown) => void;
  };
}): LLMEvent[] {
  const events: LLMEvent[] = [];
  const candidate = contentResponse.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!parts) {
    return events;
  }
  for (const part of parts) {
    events.push(
      ...partToEvents(part, {
        metadata,
        appendTextAccumulator: accumulatorUtils.appendTextAccumulator,
        appendReasoningAccumulator: accumulatorUtils.appendReasoningAccumulator,
      })
    );
  }

  if (candidate.finishReason) {
    switch (candidate.finishReason) {
      case "STOP":
        events.push(
          ...successCompletionEvents(
            contentResponse,
            metadata,
            accumulatorUtils.getTextAccumulator,
            accumulatorUtils.getReasoningAccumulator
          )
        );
        break;
      default:
        events.push(errorCompletionEvent(candidate.finishReason, metadata));
        break;
    }
  }

  return events;
}
