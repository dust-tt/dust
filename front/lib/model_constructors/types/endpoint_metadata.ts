import type { Model } from "@app/lib/model_constructors/types/model_ids";
import type { Host } from "@app/lib/model_constructors/types/provider_apis";
import type { Lab } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";

export type EndpointMetadata = {
  lab: Lab;
  host: Host;
  region: Region;
  model: Model;
  content?: Record<string, unknown>;
};
