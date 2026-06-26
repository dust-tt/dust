type BaseState = {
  accumulator: string;
  currentBlockIndex: number;
};

export type TextState = BaseState & {
  accumulatorType: "text";
};

export type ReasoningState = BaseState & {
  accumulatorType: "reasoning";
  signature?: string;
};

export type ToolUseState = BaseState & {
  accumulatorType: "tool_use";
  toolInfo: {
    id: string;
    name: string;
  };
};

// Server-side tool search (e.g. tool_search_tool_bm25). Anthropic streams the
// search query as input_json_delta chunks on a `server_tool_use` block, which
// accumulate here just like a regular tool call's arguments.
export type ToolSearchState = BaseState & {
  accumulatorType: "tool_search";
  toolName: string;
};

export type StreamState =
  | TextState
  | ReasoningState
  | ToolUseState
  | ToolSearchState
  | null;
