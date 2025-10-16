import type { ModelProviderIdType } from "@app/types";

export interface ProviderMetadata<P extends ModelProviderIdType> {
    provider: P;
    model: string;
    metadata: Record<string, any>;
}

// Stream events

export interface TextDeltaEvent {
    type: "text_delta";
    delta: string;
    metadata: ProviderMetadata<ModelProviderIdType>;
}

export interface ReasoningDeltaEvent {
    type: "reasoning_delta";
    delta: string;
    metadata: ProviderMetadata<ModelProviderIdType>;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: string;
}

export interface ToolCallEvent {
    type: "tool_call";
    toolCall: ToolCall;
    metadata: ProviderMetadata<ModelProviderIdType>;
}

export type LLMStreamEvent = TextDeltaEvent | ReasoningDeltaEvent | ToolCallEvent | LLMCompletionResult;

// Output items

export interface TextGenerated {
    type: "text_generated";
    text: string;
    metadata: ProviderMetadata<ModelProviderIdType>;
}

export interface ReasoningGenerated {
    type: "reasoning_generated";
    reasoning: string;
    metadata: ProviderMetadata<ModelProviderIdType>;
}

export type LLMOutputItem = TextGenerated | ReasoningGenerated | ToolCallEvent;

// Completion results

export interface TokenUsage {
    inputTokens: number;
    reasoningTokens: number;
    outputTokens: number;
    cachedTokens: number;
}

export interface SuccessCompletionResult {
    type: "success";
    items: LLMOutputItem[];
    tokenUsage: TokenUsage;
    metadata: ProviderMetadata<ModelProviderIdType>;
}

export interface ErrorCompletionResult {
    type: "error";
    error: {
        message: string;
        code: string;
    };
    tokenUsage: TokenUsage;
    metadata: ProviderMetadata<ModelProviderIdType>;
}

export type LLMCompletionResult = SuccessCompletionResult | ErrorCompletionResult;