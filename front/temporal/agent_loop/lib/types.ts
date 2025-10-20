import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

interface Output {
  actions: Array<{
    functionCallId: string;
    name: string | null;
    arguments: Record<string, string | boolean | number> | null;
  }>;
  generation: string | null;
  contents: Array<
    TextContentType | FunctionCallContentType | ReasoningContentType
  >;
}

export type GetOutputFromStreamResponse = {
  output: Output;
  nativeChainOfThought: string;
  dustRunId: Promise<string>;
};
