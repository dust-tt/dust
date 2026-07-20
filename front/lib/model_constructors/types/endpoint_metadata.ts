import type { Host } from "@app/lib/model_constructors/types/hosts";
import type { Lab } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import type { Region } from "@app/lib/model_constructors/types/regions";

export type EndpointMetadata = {
  lab: Lab;
  host: Host;
  region: Region;
  model: Model;
  content?: Record<string, unknown>;
};
