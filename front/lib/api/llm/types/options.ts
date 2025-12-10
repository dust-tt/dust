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
  reasoningEffort?: ReasoningEffort | null;
  responseFormat?: string | null;
  temperature?: number | null;
};

export type LLMClientMetadata = {
  clientId: string;
  modelId: ModelIdType;
};

export type ForceToolCall = string;

export interface LLMStreamParameters {
  conversation: ModelConversationTypeMultiActions;
  prompt: string;
  specifications: AgentActionSpecification[];
  /**
   * Forces the model to use a specific tool. The tool name must match one of the
   * tools defined in the `specifications` array.
   */
  forceToolCall?: ForceToolCall;
}
