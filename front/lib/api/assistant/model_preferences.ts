import { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { GEMINI_3_1_PRO_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { MISTRAL_MEDIUM_3_5_MODEL_CONFIG } from "@app/types/assistant/models/mistral";
import { GPT_5_5_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { GROK_4_MODEL_CONFIG } from "@app/types/assistant/models/xai";

export const PREFERRED_LARGE_MODEL_CONFIGS: ModelConfigurationType[] = [
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
  GPT_5_5_MODEL_CONFIG,
  GEMINI_3_1_PRO_MODEL_CONFIG,
  MISTRAL_MEDIUM_3_5_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
];

export function pickPreferredLargeModel<
  T extends Pick<ModelConfigurationType, "modelId" | "largeModel">,
>(models: T[]): T {
  for (const preferred of PREFERRED_LARGE_MODEL_CONFIGS) {
    const match = models.find((m) => m.modelId === preferred.modelId);
    if (match) {
      return match;
    }
  }

  return (
    models.find((m) => m.largeModel) ??
    models[0] ??
    CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG
  );
}
