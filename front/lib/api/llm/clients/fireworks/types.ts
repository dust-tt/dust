import type { ModelIdType } from "@app/types";
import { FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID } from "@app/types";

export const FIREWORKS_WHITELISTED_MODEL_IDS = [
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
];

export type FireworksWhitelistedModelId =
  (typeof FIREWORKS_WHITELISTED_MODEL_IDS)[number];

export function isFireworksWhitelistedModelId(
  modelId: ModelIdType
): modelId is FireworksWhitelistedModelId {
  return new Set<string>(FIREWORKS_WHITELISTED_MODEL_IDS).has(modelId);
}
