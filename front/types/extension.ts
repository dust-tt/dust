import type { ModelId } from "./shared/model_id";

export type ExtensionConfigurationType = {
  id: ModelId;
  sId: string;
  blacklistedDomains: string[];
};
