type BaseState = {
  accumulator: string;
  currentBlockIndex: number;
};

type TextState = BaseState & {
  accumulatorType: "text";
};

type ReasoningState = BaseState & {
  accumulatorType: "reasoning";
  signature?: string;
};

type ToolUseState = BaseState & {
  accumulatorType: "tool_use";
  toolInfo: {
    id: string;
    name: string;
  };
};

export type StreamState = TextState | ReasoningState | ToolUseState | null;
