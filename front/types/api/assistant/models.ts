import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";

export type EnabledModelConfigurationType = ModelConfigurationType & {
  isSelectable: boolean;
};

export type ModelStreamResolutionType = {
  providerId: ModelProviderIdType;
  modelId: string;
  displayName: string;
  reasoningEffort: ReasoningEffort;
};

// Null when no enabled concrete model can back the stream for this caller.
export type ModelStreamResolutionsType = Record<
  ModelStreamIdType,
  ModelStreamResolutionType | null
>;

export type GetEnabledModelsResponseType = {
  models: EnabledModelConfigurationType[];
  defaultModel: EnabledModelConfigurationType;
  streams: ModelStreamResolutionsType;
  fallbackStreamIds?: ModelStreamIdType[];
  degradedModelIds: string[];
};
