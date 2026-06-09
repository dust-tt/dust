// Marketing stub: the real SUPPORTED_MODEL_CONFIGS is a giant data table that
// lives in front (with imports from many provider sub-files). Until a build-
// time snapshot exists, marketing ships an empty list — the /home/api-pricing
// page will render without rows. A follow-up will bake in the snapshot.
import type { ModelConfig } from "@marketing/types/assistant/models/types";

export type StaticModelIdType = string;
export type ImageModelIdType = string;

export const SUPPORTED_MODEL_CONFIGS: ReadonlyArray<ModelConfig> = [];
