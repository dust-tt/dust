import type { ModelIdType, ReasoningEffortIdType } from "@app/types";

export type LLMParameters = {
  modelId: ModelIdType;
  reasoningEffortId?: ReasoningEffortIdType;
  temperature?: number;
  bypassFeatureFlag?: boolean;
};

export type LLMClientMetadata = {
  clientId: string;
  modelId: ModelIdType;
};
