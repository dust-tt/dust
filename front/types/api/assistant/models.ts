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

export type ModelStreamResolutionsType = Record<
  ModelStreamIdType,
  ModelStreamResolutionType
>;

export type GetEnabledModelsResponseType = {
  models: EnabledModelConfigurationType[];
  defaultModel: EnabledModelConfigurationType;
  streams: ModelStreamResolutionsType;
  degradedModelIds: string[];
};
