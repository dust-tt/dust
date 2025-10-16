// Streaming types for UI
export interface TextTokenStreamed {
  type: "text_token_streamed";
  content: string;
  metadata?: Record<string, string>;
}

export interface ReasoningTokenStreamed {
  type: "reasoning_token_streamed";
  content: string;
  metadata?: Record<string, string>;
}

export interface FunctionCallArgumentsStreamed {
  type: "function_call_arguments_streamed";
  content: string;
  metadata?: Record<string, string>;
}

export interface TokenUsageStreamed {
  type: "token_usage_streamed";
  count: number;
  metadata?: Record<string, string>;
}

export type StreamingOutput =
  | TextTokenStreamed
  | ReasoningTokenStreamed
  | FunctionCallArgumentsStreamed
  | TokenUsageStreamed;

// Item types for UI + DB boundaries
export interface FunctionCallRequested {
  type: "function_call_requested";
  name: string;
  arguments: Record<string, unknown>;
  metadata?: Record<string, string>;
}

export interface TextGenerated {
  type: "text_generated";
  content: string;
  metadata?: Record<string, string>;
}

export interface ReasoningTextGenerated {
  type: "reasoning_text_generated";
  content: string;
  metadata?: Record<string, string>;
}

export type OutputItem =
  | FunctionCallRequested
  | TextGenerated
  | ReasoningTextGenerated;

// Completion types for UI + DB
export interface TokenUsage {
  input_tokens: number;
  output_text_tokens: number;
  output_reasoning_tokens: number;
  total_tokens: number;
  metadata?: Record<string, string>;
}

export interface TokenUsageCompleted {
  type: "token_usage_completed";
  usage: TokenUsage;
}

export interface SuccessCompletion {
  type: "success";
  items: OutputItem[];
}

export interface ErrorCompletion {
  type: "error";
  error: {
    message: string;
    code?: string;
  };
}

export type Completion =
  | TokenUsageCompleted
  | SuccessCompletion
  | ErrorCompletion;
