import type { ModelIdType } from "@app/types";
import {
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
} from "@app/types";

export const ANTHROPIC_WHITELISTED_NON_REASONING_MODEL_IDS = [
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
];

const ANTHROPIC_WHITELISTED_REASONING_MODEL_IDS: ModelIdType[] = [];

export const ANTHROPIC_WHITELISTED_MODEL_IDS: ModelIdType[] = [
  ...ANTHROPIC_WHITELISTED_NON_REASONING_MODEL_IDS,
  ...ANTHROPIC_WHITELISTED_REASONING_MODEL_IDS,
];

export function isAnthropicWhitelistedModelId(
  modelId: ModelIdType
): modelId is AnthropicWhitelistedModelId {
  return (ANTHROPIC_WHITELISTED_MODEL_IDS as readonly string[]).includes(
    modelId
  );
}

export type AnthropicWhitelistedModelId =
  (typeof ANTHROPIC_WHITELISTED_MODEL_IDS)[number];
