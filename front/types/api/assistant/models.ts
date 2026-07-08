import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export type EnabledModelConfigurationType = ModelConfigurationType & {
  isSelectable: boolean;
};

export type GetEnabledModelsResponseType = {
  models: EnabledModelConfigurationType[];
};
