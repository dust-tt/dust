import type { Host } from "@app/lib/model_constructors/types/hosts";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";

/**
 * The unit of degradation, and therefore of health: the same model is served
 * from several hosts (Claude via `anthropic` and `agent-platform`, Gemini via
 * `google-ai-studio` and `agent-platform`) and an incident usually hits one of
 * them.
 *
 * When logging one of these, rename `host` to `modelHost`: `host` is reserved by
 * our log infrastructure and gets dropped or reinterpreted.
 */
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
