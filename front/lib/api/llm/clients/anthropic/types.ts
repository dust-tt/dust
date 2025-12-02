import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import {
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
} from "@app/types";

export const ANTHROPIC_PROVIDER_ID = "anthropic";

export const ANTHROPIC_WHITELISTED_MODEL_IDS = [
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
] as const;
export type AnthropicWhitelistedModelId =
  (typeof ANTHROPIC_WHITELISTED_MODEL_IDS)[number];

const NON_THINKING_OVERWRITES: Partial<LLMParameters> = {
  reasoningEffort: null,
};
const THINKING_OVERWRITES: Partial<LLMParameters> = {
  temperature: 1,
};

export const ANTHROPIC_MODEL_CONFIGS: Record<
  AnthropicWhitelistedModelId,
  { overwrites: Omit<LLMParameters, "modelId"> }
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
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: AnthropicWhitelistedModelId;
  }
): LLMParameters & { modelId: AnthropicWhitelistedModelId } & {
  clientId: typeof ANTHROPIC_PROVIDER_ID;
} {
  return {
    ...llmParameters,
    ...ANTHROPIC_MODEL_CONFIGS[llmParameters.modelId].overwrites,
    clientId: ANTHROPIC_PROVIDER_ID,
  };
}

export const isAnthropicWhitelistedModelId = (
  modelId: ModelIdType
): modelId is AnthropicWhitelistedModelId => {
  return (ANTHROPIC_WHITELISTED_MODEL_IDS as readonly string[]).includes(
    modelId
  );
};
