import flatMap from "lodash/flatMap";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import { FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID } from "@app/types";

export const FIREWORKS_MODEL_FAMILIES = ["kimi"] as const;
export type FireworksModelFamily = (typeof FIREWORKS_MODEL_FAMILIES)[number];

export const FIREWORKS_MODEL_FAMILY_CONFIGS: Record<
  FireworksModelFamily,
  {
    modelIds: ModelIdType[];
    overwrites: Partial<LLMParameters>;
  }
> = {
  kimi: {
    modelIds: [FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID],
    overwrites: { reasoningEffort: "none" },
  },
};

export type FireworksWhitelistedModelId = {
  [K in FireworksModelFamily]: (typeof FIREWORKS_MODEL_FAMILY_CONFIGS)[K]["modelIds"][number];
}[FireworksModelFamily];
const FIREWORKS_WHITELISTED_MODEL_IDS = flatMap<FireworksWhitelistedModelId>(
  Object.values(FIREWORKS_MODEL_FAMILY_CONFIGS).map((config) => config.modelIds)
);

export function isFireworksWhitelistedModelId(
  modelId: ModelIdType
): modelId is FireworksWhitelistedModelId {
  return new Set<string>(FIREWORKS_WHITELISTED_MODEL_IDS).has(modelId);
}

export function getFireworksModelFamilyFromModelId(
  modelId: FireworksWhitelistedModelId
): FireworksModelFamily {
  const family = FIREWORKS_MODEL_FAMILIES.find((family) =>
    FIREWORKS_MODEL_FAMILY_CONFIGS[family].modelIds.includes(modelId)
  );
  if (!family) {
    throw new Error(
      `Model ID ${modelId} does not belong to any Fireworks model family`
    );
  }
  return family;
}

export function overwriteLLMParameters(
  llmParameters: LLMParameters & { modelId: FireworksWhitelistedModelId }
): LLMParameters & {
  modelId: FireworksWhitelistedModelId;
  clientId: "fireworks";
} {
  const config = Object.values(FIREWORKS_MODEL_FAMILY_CONFIGS).find((config) =>
    new Set<string>(config.modelIds).has(llmParameters.modelId)
  );

  return {
    ...llmParameters,
    ...config?.overwrites,
    clientId: "fireworks" as const,
  };
}
