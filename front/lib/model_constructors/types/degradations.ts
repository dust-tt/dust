import type { Host } from "@app/lib/model_constructors/types/hosts";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";

// if logging, rename host->modelHost (reserved keyword)
export type DegradedModelEndpointType = {
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  host: Host;
};

export type DegradedModelEndpointUpdateType = DegradedModelEndpointType & {
  degraded: boolean;
};

export function degradedModelEndpointKey({
  modelId,
  providerId,
  host,
}: {
  modelId: string;
  providerId: string;
  host: string;
}): string {
  return `${modelId}|${providerId}|${host}`;
}
