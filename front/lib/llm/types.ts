import type { Responses } from "openai/resources/index.mjs";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatStreamOptions {
  input: Responses.ResponseInput;
  maxTokens?: number;
  stream?: boolean;
}

export interface StreamTokenEvent {
  type: "tokens";
  content: {
    tokens: {
      text: string;
    };
  };
}

export interface StreamReasoningTokenEvent {
  type: "reasoning_tokens";
  content: {
    tokens: {
      text: string;
    };
  };
}

export interface StreamFunctionCallEvent {
  type: "function_call";
  content: {
    name: string;
  };
}

export interface StreamReasoningItemEvent {
  type: "reasoning_item";
  content: {
    metadata: string;
  };
}

export interface StreamResponseCompletedItemEvent {
  type: "response_completed";
  content: {
    response: {
      id: string;
      status: "completed";
      model: string;
      output: Array<{
        // id: string;
        type: string;
        status: "completed";
        content: Array<{
          type: string;
          text?: string;
        }>;
        role: "assistant";
      }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
      };
    };
  };
}

export type StreamEvent =
  | StreamTokenEvent
  | StreamReasoningTokenEvent
  | StreamFunctionCallEvent
  | StreamReasoningItemEvent
  | StreamResponseCompletedItemEvent;
