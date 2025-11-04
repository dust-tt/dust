import type { ModelIdType } from "@app/types";
import {
  GROK_3_MODEL_ID,
  GROK_4_FAST_NON_REASONING_MODEL_ID,
  GROK_4_MODEL_ID,
} from "@app/types";

export const XAI_WHITELISTED_NON_REASONING_MODEL_IDS = [
  GROK_4_FAST_NON_REASONING_MODEL_ID,
];
export const XAI_WHITELISTED_MODELS_WITHOUT_IMAGE_SUPPORT = [GROK_3_MODEL_ID];
export const XAI_WHITELISTED_REASONING_MODEL_IDS = [GROK_4_MODEL_ID];

export const XAI_WHITELISTED_MODEL_IDS = [
  ...XAI_WHITELISTED_NON_REASONING_MODEL_IDS,
  ...XAI_WHITELISTED_MODELS_WITHOUT_IMAGE_SUPPORT,
  ...XAI_WHITELISTED_REASONING_MODEL_IDS,
];

export type XaiWhitelistedModelId = (typeof XAI_WHITELISTED_MODEL_IDS)[number];

export function isXaiWhitelistedModelId(
  modelId: ModelIdType
): modelId is XaiWhitelistedModelId {
  return new Set<string>(XAI_WHITELISTED_MODEL_IDS).has(modelId);
}
