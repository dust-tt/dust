import assert from "assert";
import flatMap from "lodash/flatMap";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import { FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID } from "@app/types";

const FIREWORKS_MODEL_FAMILIES = ["fireworks"] as const;
export type FireworksModelFamily = (typeof FIREWORKS_MODEL_FAMILIES)[number];

const FIREWORKS_MODEL_FAMILY_CONFIGS = {
  fireworks: {
    modelIds: [FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID],
    overwrites: {},
  },
} as const;

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

export function overwriteLLMParameters(
  llMParameters: LLMParameters & { modelId: FireworksWhitelistedModelId }
): LLMParameters & {
  modelId: FireworksWhitelistedModelId;
  clientId: "fireworks";
} {
  const config = Object.values(FIREWORKS_MODEL_FAMILY_CONFIGS).find((config) =>
    new Set<string>(config.modelIds).has(llMParameters.modelId)
  );
  assert(
    config,
    `No Fireworks model family config found for model ID ${llMParameters.modelId}`
  );

  return {
    ...llMParameters,
    ...config.overwrites,
    clientId: "fireworks",
  };
}
