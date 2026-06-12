import type { ModelId } from "@app/lib/model_constructors/types/model_ids";
import type { ProviderApi } from "@app/lib/model_constructors/types/provider_apis";
import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";

export type EndpointMetadata = {
  providerId: ProviderId;
  api: ProviderApi;
  region: Region;
  modelId: ModelId;
  content?: Record<string, unknown>;
};
