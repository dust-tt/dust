import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import {
  MISTRAL_CODESTRAL_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
} from "@app/types";

export const MISTRAL_WHITELISTED_MODEL_IDS_WITHOUT_IMAGE_SUPPORT = [
  MISTRAL_CODESTRAL_MODEL_ID,
];

export const MISTRAL_GENERIC_WHITELISTED_MODEL_IDS = [
  MISTRAL_SMALL_MODEL_ID,
  MISTRAL_MEDIUM_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
];

export const MISTRAL_WHITELISTED_MODEL_IDS = [
  ...MISTRAL_GENERIC_WHITELISTED_MODEL_IDS,
  ...MISTRAL_WHITELISTED_MODEL_IDS_WITHOUT_IMAGE_SUPPORT,
];

export const MISTRAL_MODEL_FAMILY_CONFIGS: Record<
  MistralModelFamily,
  {
    modelIds: ModelIdType[];
    overwrites: Partial<LLMParameters>;
  }
> = {
  reasoning: {
    modelIds: MISTRAL_WHITELISTED_MODEL_IDS,
    overwrites: { temperature: null },
  },
  "non-reasoning": {
    modelIds: MISTRAL_WHITELISTED_MODEL_IDS,
    overwrites: { reasoningEffort: null },
  },
} as const;

export function getMistralModelFamilyFromModelId(
  modelId: ModelIdType
): MistralModelFamily {
  const family = MISTRAL_MODEL_FAMILIES.find((family) =>
    MISTRAL_MODEL_FAMILY_CONFIGS[family].modelIds.includes(modelId)
  );
  if (!family) {
    throw new Error(
      `Model ID ${modelId} does not belong to any Mistral model family`
    );
  }
  return family;
}

export type MistralWhitelistedModelId =
  (typeof MISTRAL_WHITELISTED_MODEL_IDS)[number];

export function isMistralWhitelistedModelId(
  modelId: ModelIdType
): modelId is MistralWhitelistedModelId {
  return new Set<string>(MISTRAL_WHITELISTED_MODEL_IDS).has(modelId);
}

export const MISTRAL_MODEL_FAMILIES = ["non-reasoning", "reasoning"] as const;
export type MistralModelFamily = (typeof MISTRAL_MODEL_FAMILIES)[number];
