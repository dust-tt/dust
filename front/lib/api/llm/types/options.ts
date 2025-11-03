import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ReasoningEffort,
} from "@app/types";

export type LLMParameters = {
  bypassFeatureFlag?: boolean;
  context?: LLMTraceContext;
  modelId: ModelIdType;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
};

export type LLMClientMetadata = {
  clientId: string;
  modelId: ModelIdType;
};

export interface StreamParameters {
  conversation: ModelConversationTypeMultiActions;
  prompt: string;
  specifications: AgentActionSpecification[];
}
