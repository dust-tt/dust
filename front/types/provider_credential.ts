import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";

export type ProviderCredentialType = {
  sId: string;
  id: ModelId;
  createdAt: number;
  updatedAt: number;
  providerId: ModelProviderIdType;
  credentialId: string;
  isHealthy: boolean;
  placeholder: string;
  editedByUserId: ModelId | null;
};
