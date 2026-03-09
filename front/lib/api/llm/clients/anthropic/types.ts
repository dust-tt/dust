import type { LLMParameters } from "@app/lib/api/llm/types/options";
import {
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { CUSTOM_MODEL_IDS } from "@app/types/assistant/models/custom_models.generated";
import type { ModelIdType } from "@app/types/assistant/models/types";

export const ANTHROPIC_PROVIDER_ID = "anthropic";

export const ANTHROPIC_WHITELISTED_MODEL_IDS = [
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  // Custom Anthropic models (generated at build time from GCS)
  ...CUSTOM_MODEL_IDS,
] as const;
export type AnthropicWhitelistedModelId =
  (typeof ANTHROPIC_WHITELISTED_MODEL_IDS)[number];

const NON_THINKING_OVERWRITES: Partial<LLMParameters> = {
  reasoningEffort: null,
};
const THINKING_OVERWRITES: Partial<LLMParameters> = {
  temperature: 1,
};

// Config overwrites for static Anthropic models. Custom models use THINKING_OVERWRITES by default.
const STATIC_ANTHROPIC_MODEL_CONFIGS: Partial<
  Record<
    AnthropicWhitelistedModelId,
    { overwrites: Omit<LLMParameters, "modelId"> }
  >
> = {
  [CLAUDE_3_OPUS_2024029_MODEL_ID]: {
    overwrites: NON_THINKING_OVERWRITES,
  },
  [CLAUDE_3_5_HAIKU_20241022_MODEL_ID]: {
    overwrites: NON_THINKING_OVERWRITES,
  },
  [CLAUDE_4_OPUS_20250514_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
  },
  [CLAUDE_4_5_OPUS_20251101_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
  },
  [CLAUDE_4_5_HAIKU_20251001_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
  },
  [CLAUDE_4_SONNET_20250514_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
  },
  [CLAUDE_4_5_SONNET_20250929_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
  },
  [CLAUDE_OPUS_4_6_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
  },
  [CLAUDE_SONNET_4_6_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
  },
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: AnthropicWhitelistedModelId;
  }
): LLMParameters & { modelId: AnthropicWhitelistedModelId } {
  // Custom models default to THINKING_OVERWRITES
  const config = STATIC_ANTHROPIC_MODEL_CONFIGS[llmParameters.modelId];
  const overwrites = config?.overwrites ?? THINKING_OVERWRITES;
  return {
    ...llmParameters,
    ...overwrites,
  };
}

export const isAnthropicWhitelistedModelId = (
  modelId: ModelIdType
): modelId is AnthropicWhitelistedModelId => {
  return (ANTHROPIC_WHITELISTED_MODEL_IDS as readonly string[]).includes(
    modelId
  );
};
