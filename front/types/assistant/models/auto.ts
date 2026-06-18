import { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export const AUTO_MODEL_ID = "auto" as const;

export const AUTO_MODEL_CONFIG: ModelConfigurationType = {
  ...CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
  providerId: "noop",
  modelId: AUTO_MODEL_ID,
  displayName: "Auto",
  description:
    "Dust automatically selects the best available model for this workspace at runtime.",
  shortDescription: "Dust selects the model at runtime",
  isLegacy: false,
  isLatest: true,
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};

export function isAutoModelId(modelId: string): modelId is typeof AUTO_MODEL_ID {
  return modelId === AUTO_MODEL_ID;
}
