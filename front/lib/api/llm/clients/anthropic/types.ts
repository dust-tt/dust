import type { ModelIdType } from "@app/types";
import { CLAUDE_4_5_HAIKU_20251001_MODEL_ID } from "@app/types";

export const ANTHROPIC_WHITELISTED_NON_REASONING_MODEL_IDS = [];

const ANTHROPIC_WHITELISTED_REASONING_MODEL_IDS: ModelIdType[] = [
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
];

export const ANTHROPIC_WHITELISTED_MODEL_IDS: ModelIdType[] = [
  ...ANTHROPIC_WHITELISTED_NON_REASONING_MODEL_IDS,
  ...ANTHROPIC_WHITELISTED_REASONING_MODEL_IDS,
];

export function isAnthropicWhitelistedModelId(
  modelId: ModelIdType
): modelId is AnthropicWhitelistedModelId {
  return new Set<string>(ANTHROPIC_WHITELISTED_MODEL_IDS).has(modelId);
}

export type AnthropicWhitelistedModelId =
  (typeof ANTHROPIC_WHITELISTED_MODEL_IDS)[number];
