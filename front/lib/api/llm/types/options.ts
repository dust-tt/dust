import type { ModelIdType, ReasoningEffort } from "@app/types";

export type LLMParameters = {
  modelId: ModelIdType;
  reasoningEffortId?: ReasoningEffort;
  temperature?: number;
  bypassFeatureFlag?: boolean;
};

export type LLMClientMetadata = {
  clientId: string;
  modelId: ModelIdType;
};
