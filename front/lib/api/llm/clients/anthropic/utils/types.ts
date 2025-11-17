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

export type StreamState = TextState | ReasoningState | ToolUseState | null;
