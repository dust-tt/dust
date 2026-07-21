import {
  FIREWORKS_DEEPSEEK_V3P2_MODEL_ID,
  FIREWORKS_DEEPSEEK_V4_PRO_MODEL_ID,
  FIREWORKS_GLM_5_MODEL_ID,
  FIREWORKS_GLM_5P2_MODEL_ID,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
  FIREWORKS_KIMI_K2P5_MODEL_ID,
  FIREWORKS_KIMI_K2P6_MODEL_ID,
  FIREWORKS_MINIMAX_M2P5_MODEL_ID,
} from "@app/types/assistant/models/fireworks";
import type { ModelIdType } from "@app/types/assistant/models/types";

export const FIREWORKS_PROVIDER_ID = "fireworks";

export const FIREWORKS_WHITELISTED_MODEL_IDS = [
  FIREWORKS_DEEPSEEK_V3P2_MODEL_ID,
  FIREWORKS_DEEPSEEK_V4_PRO_MODEL_ID,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
  FIREWORKS_KIMI_K2P5_MODEL_ID,
  FIREWORKS_KIMI_K2P6_MODEL_ID,
  FIREWORKS_MINIMAX_M2P5_MODEL_ID,
  FIREWORKS_GLM_5_MODEL_ID,
  FIREWORKS_GLM_5P2_MODEL_ID,
] as const;
export type FireworksWhitelistedModelId =
  (typeof FIREWORKS_WHITELISTED_MODEL_IDS)[number];

export const isFireworksWhitelistedModelId = (
  modelId: ModelIdType
): modelId is FireworksWhitelistedModelId => {
  return (FIREWORKS_WHITELISTED_MODEL_IDS as readonly string[]).includes(
    modelId
  );
};
