import type { AgentReasoningEffort } from "@app/types";

export type LLMOptions = {
  reasoningEffort?: AgentReasoningEffort;
  temperature?: number;
};
