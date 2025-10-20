import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { AgentReasoningEffort } from "@app/types";

export type LLMOptions = {
  reasoningEffort?: AgentReasoningEffort;
  temperature?: number;
  specifications: AgentActionSpecification[];
};
