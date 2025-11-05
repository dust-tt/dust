import flatMap from "lodash/flatMap";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import {
  CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
} from "@app/types";

export const ANTHROPIC_MODEL_FAMILIES = ["non-reasoning", "reasoning"] as const;
export type AnthropicModelFamily = (typeof ANTHROPIC_MODEL_FAMILIES)[number];

export const ANTHROPIC_MODEL_FAMILIES_CONFIGS: Record<
  AnthropicModelFamily,
  {
    modelIds: ModelIdType[];
    overwrites: Partial<LLMParameters>;
  }
> = {
  "non-reasoning": {
    modelIds: [
      CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.modelId,
      CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG.modelId,
    ],
    overwrites: { reasoningEffort: null },
  },
  reasoning: {
    modelIds: [
      CLAUDE_4_OPUS_DEFAULT_MODEL_CONFIG.modelId,
      CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.modelId,
      CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG.modelId,
      CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG.modelId,
    ],
    // Thinking isn’t compatible with temperature: `temperature` may only be set to 1 when thinking is enabled.
    overwrites: { temperature: 1 },
  },
};

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
    ANTHROPIC_MODEL_FAMILIES_CONFIGS[family].modelIds.includes(modelId)
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
