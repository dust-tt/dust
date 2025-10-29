export const ANTHROPIC_WHITELISTED_MODEL_IDS = ["claude-sonnet-4-5-20250929"];

export type AnthropicWhitelistedModelId =
  (typeof ANTHROPIC_WHITELISTED_MODEL_IDS)[number];
