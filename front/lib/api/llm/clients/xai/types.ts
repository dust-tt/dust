import flatMap from "lodash/flatMap";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import {
  GROK_3_MINI_MODEL_ID,
  GROK_3_MODEL_ID,
  GROK_4_1_FAST_NON_REASONING_MODEL_ID,
  GROK_4_1_FAST_REASONING_MODEL_ID,
  GROK_4_FAST_NON_REASONING_MODEL_ID,
  GROK_4_MODEL_ID,
} from "@app/types";

export const XAI_MODEL_FAMILIES = [
  "no-vision",
  "non-reasoning",
  "reasoning",
] as const;
export type XaiModelFamily = (typeof XAI_MODEL_FAMILIES)[number];

export const XAI_MODEL_FAMILIES_CONFIGS: Record<
  XaiModelFamily,
  {
    modelIds: ModelIdType[];
    overwrites: Partial<LLMParameters>;
  }
> = {
  "no-vision": {
    modelIds: [GROK_3_MODEL_ID, GROK_3_MINI_MODEL_ID],
    overwrites: { reasoningEffort: null },
  },
  "non-reasoning": {
    modelIds: [
      GROK_4_FAST_NON_REASONING_MODEL_ID,
      GROK_4_MODEL_ID,
      GROK_4_1_FAST_NON_REASONING_MODEL_ID,
    ],
    overwrites: { reasoningEffort: null },
  },
  reasoning: {
    modelIds: [GROK_4_1_FAST_REASONING_MODEL_ID],
    overwrites: {},
  },
};

export type XaiWhitelistedModelId = {
  [K in XaiModelFamily]: (typeof XAI_MODEL_FAMILIES_CONFIGS)[K]["modelIds"][number];
}[XaiModelFamily];
export const XAI_WHITELISTED_MODEL_IDS = flatMap<XaiWhitelistedModelId>(
  Object.values(XAI_MODEL_FAMILIES_CONFIGS).map((config) => config.modelIds)
);

export function isXaiWhitelistedModelId(
  modelId: ModelIdType
): modelId is XaiWhitelistedModelId {
  return new Set<string>(XAI_WHITELISTED_MODEL_IDS).has(modelId);
}

export function getXaiModelFamilyFromModelId(
  modelId: XaiWhitelistedModelId
): XaiModelFamily {
  const family = XAI_MODEL_FAMILIES.find((family) =>
    XAI_MODEL_FAMILIES_CONFIGS[family].modelIds.includes(modelId)
  );
  if (!family) {
    throw new Error(
      `Model ID ${modelId} does not belong to any XAI model family`
    );
  }
  return family;
}

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: XaiWhitelistedModelId;
  }
): LLMParameters & { modelId: XaiWhitelistedModelId } & {
  clientId: "xai";
} {
  const config = Object.values(XAI_MODEL_FAMILIES_CONFIGS).find((config) =>
    new Set<string>(config.modelIds).has(llmParameters.modelId)
  );

  return {
    ...llmParameters,
    ...config?.overwrites,
    clientId: "xai" as const,
  };
}
