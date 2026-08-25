import { isModelStreamId } from "@app/types/assistant/models/auto";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export const KILLABLE_MODEL_CONFIGS: ModelConfigurationType[] =
  SUPPORTED_MODEL_CONFIGS.filter(
    (m) => !isModelStreamId(m.modelId) && m.providerId !== "noop"
  );

// Widened to `string` for dynamic models coming from GCS:
// callers check ids coming off the wire.
const KILLABLE_MODEL_IDS = new Set<string>(
  KILLABLE_MODEL_CONFIGS.map((m) => m.modelId)
);

export function isKillableModelId(modelId: string): boolean {
  return KILLABLE_MODEL_IDS.has(modelId);
}
