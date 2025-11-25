import flatMap from "lodash/flatMap";

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

export const ANTHROPIC_MODEL_FAMILIES = ["non-reasoning", "reasoning"] as const;
export type AnthropicModelFamily = (typeof ANTHROPIC_MODEL_FAMILIES)[number];

export const ANTHROPIC_MODEL_FAMILIES_CONFIGS = {
  "non-reasoning": {
    modelIds: [
      CLAUDE_3_OPUS_2024029_MODEL_ID,
      CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
    ],
    overwrites: { reasoningEffort: null },
  },
  reasoning: {
    modelIds: [
      CLAUDE_4_OPUS_20250514_MODEL_ID,
      CLAUDE_4_SONNET_20250514_MODEL_ID,
      CLAUDE_4_5_SONNET_20250929_MODEL_ID,
      CLAUDE_4_5_OPUS_20251101_MODEL_ID,
      CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
    ],
    // Thinking isn’t compatible with temperature: `temperature` may only be set to 1 when thinking is enabled.
    overwrites: { temperature: 1 },
  },
} as const satisfies Record<
  AnthropicModelFamily,
  {
    modelIds: ModelIdType[];
    overwrites: Partial<LLMParameters>;
  }
>;

export type AnthropicWhitelistedModelId = {
  [K in AnthropicModelFamily]: (typeof ANTHROPIC_MODEL_FAMILIES_CONFIGS)[K]["modelIds"][number];
}[AnthropicModelFamily];
export const ANTHROPIC_WHITELISTED_MODEL_IDS =
  flatMap<AnthropicWhitelistedModelId>(
    Object.values(ANTHROPIC_MODEL_FAMILIES_CONFIGS).map(
      (config) => config.modelIds
    )
  );

export function isAnthropicWhitelistedModelId(
  modelId: ModelIdType
): modelId is AnthropicWhitelistedModelId {
  return new Set<string>(ANTHROPIC_WHITELISTED_MODEL_IDS).has(modelId);
}

export function getAnthropicModelFamilyFromModelId(
  modelId: AnthropicWhitelistedModelId
): AnthropicModelFamily {
  const family = ANTHROPIC_MODEL_FAMILIES.find((family) =>
    new Set(ANTHROPIC_MODEL_FAMILIES_CONFIGS[family].modelIds).has(modelId)
  );
  if (!family) {
    throw new Error(
      `Model ID ${modelId} does not belong to any Anthropic model family`
    );
  }
  return family;
}

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: AnthropicWhitelistedModelId;
  }
): LLMParameters & { modelId: AnthropicWhitelistedModelId } & {
  clientId: "anthropic";
} {
  const config = Object.values(ANTHROPIC_MODEL_FAMILIES_CONFIGS).find(
    (config) => new Set<string>(config.modelIds).has(llmParameters.modelId)
  );

  return {
    ...llmParameters,
    ...config?.overwrites,
    clientId: "anthropic" as const,
  };
}
