import type { ModelId } from "@app/lib/model_constructors/types/model_ids";
import type { ProviderApi } from "@app/lib/model_constructors/types/provider_apis";
import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export type Filter = {
  providerIds?: ProviderId[];
  modelIds?: ModelId[];
  regions?: Region[];
  apis?: ProviderApi[];
  featureFlags: WhitelistableFeature[];
  byok?: boolean;
  enterprise?: boolean;
};
