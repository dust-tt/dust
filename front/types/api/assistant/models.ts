import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";

export type EnabledModelConfigurationType = ModelConfigurationType & {
  isSelectable: boolean;
  // Added by the models endpoint. Optional for compatibility with responses
  // produced by an older server during a rolling deployment.
  selectionAvailability?: ModelSelectionAvailabilityType;
};

export type ModelSelectionLockReason = "workspace_plan" | "model_access";

export type ReasoningEffortSelectionUnavailabilityReason =
  | "unsupported"
  | ModelSelectionLockReason;

export interface ReasoningEffortSelectionAvailabilityType {
  effort: ReasoningEffort;
  // null means this exact model + reasoning effort can be selected.
  unavailabilityReason: ReasoningEffortSelectionUnavailabilityReason | null;
}

export interface ModelSelectionAvailabilityType {
  defaultReasoningEffort: ReasoningEffort;
  // Reasoning models always report Light, Medium, and High so the slider keeps
  // a stable shape. Non-reasoning models report no effort stops.
  reasoningEfforts: ReasoningEffortSelectionAvailabilityType[];
  lockReason: ModelSelectionLockReason | null;
}

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
